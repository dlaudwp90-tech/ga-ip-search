// pages/api/kipris-daily-sync.js
// ─────────────────────────────────────────────────────────────────────────────
// 【연차/갱신 관리 - 동기화 함수】  ⚠ 수정 주의: 데이터 적재 로직입니다.
//
//  목적: 김수산 대리인의 '등록 상표' 목록과 각 권리의 연차/갱신 마감을 KIPRIS에서
//        가져와 Redis(renewals:data)에 캐시합니다. 대시보드는 이 캐시만 읽습니다.
//
//  ★ KIPRIS 호출 최소화 설계 ★
//    - 목록 조회: 하루 1~2회 (전체 등록 상표 리스트)
//    - 상세 조회(연차/분할 판정): "처음 보는 등록번호" + "마감 9개월 창에 들어왔고 7일 이상
//      재확인 안 한 건"만 호출. 즉 한번 가져온 정적 데이터는 다시 안 부릅니다.
//    - 대시보드 표시: KIPRIS 0회 (남은 일수는 저장된 마감일로 매일 자동 계산)
//
//  필요한 환경변수 (이미 설정돼 있음):
//    KIPRIS_ACCESS_KEY              (KIPRIS Plus 키)
//    UPSTASH_REDIS_REST_URL / _TOKEN(review.js 와 동일)
//    KIPRIS_SYNC_SECRET            (없으면 기본 "ga-sync-2026")
//    KIPRIS_AGENT_CODE             (없으면 기본 "920210007229" = 김수산 대리인번호)
//
//  ▶ 최초 1회 백필(처음 한 번): 아래 주소를 열고, 결과 JSON의 "done"이 true 될 때까지 새로고침.
//      https://staff.markangel.co.kr/api/kipris-daily-sync?secret=ga-sync-2026
//      (등록 상표가 많아 한 번에 다 못 돌면 배치로 나눠 처리됩니다. remaining=남은 건수)
//  ▶ 이후 운영: Vercel Cron이 하루 1회 이 주소를 자동 호출 (대시보드 완성 후 설정 안내)
// ─────────────────────────────────────────────────────────────────────────────

export const config = { maxDuration: 60 }; // Pro면 한 번에 더 많이 처리 (Hobby는 자동으로 짧게)

// ── Upstash Redis REST (pipeline) — review.js 와 동일 방식, 패키지 불필요 ──
async function redisPipeline(url, token, commands) {
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}: ${await res.text()}`);
  return res.json(); // [{result:...}, ...]
}

export default async function handler(req, res) {
  const startedAt = Date.now();

  // 시크릿 확인 (쿼리 또는 헤더)
  const SYNC_SECRET = process.env.KIPRIS_SYNC_SECRET || "ga-sync-2026";
  const given = req.query.secret || req.headers["x-sync-secret"] || "";
  if (given !== SYNC_SECRET) return res.status(401).json({ error: "Unauthorized" });

  const ACCESS_KEY = process.env.KIPRIS_ACCESS_KEY;
  const R_URL = process.env.UPSTASH_REDIS_REST_URL;
  const R_TOK = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!ACCESS_KEY) return res.status(500).json({ error: "KIPRIS_ACCESS_KEY 미설정" });
  if (!R_URL || !R_TOK) return res.status(500).json({ error: "UPSTASH_REDIS_REST_URL/TOKEN 미설정" });

  const AGENT = process.env.KIPRIS_AGENT_CODE || "920210007229"; // 김수산 대리인번호
  const KEY = encodeURIComponent(ACCESS_KEY);

  // 한 번 실행에서 상세조회 최대치 / 시간예산 (타임아웃 방지)
  const MAX_FETCHES = Math.min(parseInt(req.query.max || "50", 10) || 50, 200);
  const TIME_BUDGET_MS = 45000; // Pro 60s 한도 안에서 안전하게

  const ALERT_MONTHS = 9;       // 마감 9개월 전부터 알림/재확인
  const RECHECK_DAYS = 7;       // 알림창 안의 건은 7일마다만 재조회

  // ── XML/날짜 헬퍼 ──
  const getTag = (t, tag) => {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"); const out = []; let m;
    while ((m = re.exec(t)) !== null) out.push(m[1].trim()); return out;
  };
  const one = (t, tag) => getTag(t, tag)[0] || "";
  const toDate = (s) => { // 'YYYYMMDD' 또는 'YYYY-MM-DD' → Date
    if (!s) return null; const d = s.replace(/-/g, "");
    return d.length >= 8 ? new Date(+d.slice(0,4), +d.slice(4,6)-1, +d.slice(6,8)) : null;
  };
  const addYears = (d, y) => { const n = new Date(d); n.setFullYear(n.getFullYear()+y); return n; };
  const addMonths = (d, mm) => { const n = new Date(d); n.setMonth(n.getMonth()+mm); return n; };
  const iso = (d) => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` : "";

  try {
    // ── 0) 기존 캐시 읽기 ──
    let prev = [];
    try {
      const r = await redisPipeline(R_URL, R_TOK, [["GET", "renewals:data"]]);
      const raw = r?.[0]?.result;
      if (raw) prev = JSON.parse(raw);
    } catch { prev = []; }
    const prevMap = new Map(prev.map(x => [x.regNo, x]));

    // ── 1) 등록 상표 목록 조회 (페이지네이션) ──
    const fetchListPage = async (page) => {
      const url = `http://plus.kipris.or.kr/openapi/rest/trademarkInfoSearchService/agentNamesearchInfo`
        + `?agentName=${encodeURIComponent(AGENT)}&registration=true`
        + `&docsStart=${page}&docsCount=500&sortSpec=RD&descSort=true&accessKey=${KEY}`;
      const r = await fetch(url); const xml = await r.text();
      const total = parseInt(one(xml, "TotalSearchCount") || "0", 10);
      const blocks = [...xml.matchAll(/<TradeMarkInfo>([\s\S]*?)<\/TradeMarkInfo>/g)].map(m => m[1]);
      const marks = blocks.map(b => ({
        title:   one(b, "Title"),
        regNo:   one(b, "RegistrationNumber"),
        regDate: one(b, "RegistrationDate"),
        status:  one(b, "ApplicationStatus"),
      }));
      return { total, marks };
    };

    const first = await fetchListPage(1);
    let listMarks = first.marks;
    const totalPages = Math.min(Math.ceil((first.total || 0) / 500), 5); // 안전상 최대 5페이지
    for (let p = 2; p <= totalPages; p++) {
      const pg = await fetchListPage(p);
      listMarks = listMarks.concat(pg.marks);
    }

    // 등록(살아있는) + 국내 등록번호(13자리)만, 중복 제거
    const seen = new Set();
    const registered = listMarks.filter(m => {
      const ok = m.status.includes("등록") && /^\d{13}$/.test(m.regNo) && !seen.has(m.regNo);
      if (ok) seen.add(m.regNo);
      return ok;
    });

    // ── 2) 상세조회가 필요한 대상(todo) 선정 ──
    const now = new Date();
    const needDetail = (rec) => {
      if (!rec || rec.detailPending) return true;               // 처음 보는/미완성 건
      if (!rec.nextDeadline) return false;
      const dl = toDate(rec.nextDeadline);
      const inWindow = dl && dl <= addMonths(now, ALERT_MONTHS); // 마감 9개월 창
      if (!inWindow) return false;                               // 창 밖이면 재조회 불필요
      const checked = rec.checkedAt ? new Date(rec.checkedAt) : null;
      const stale = !checked || (now - checked) > RECHECK_DAYS * 86400000;
      return stale;                                              // 창 안 + 7일 이상 지남 → 재확인
    };
    const todo = registered.filter(m => needDetail(prevMap.get(m.regNo)));

    // ── 3) todo 상세조회 (시간/건수 예산 내에서) ──
    let processed = 0;
    const detailMap = new Map(); // regNo → 완성 record
    for (const m of todo) {
      if (processed >= MAX_FETCHES) break;
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      try {
        const url = `http://plus.kipris.or.kr/openapi/rest/RegistrationService/registrationInfo`
          + `?registrationNumber=${m.regNo}&accessKey=${KEY}`;
        const r = await fetch(url); const xml = await r.text();

        const right = (xml.match(/<registrationRightInfo>([\s\S]*?)<\/registrationRightInfo>/) || [])[1] || "";
        const regDate   = one(right, "registrationDate") || m.regDate;
        const expDate   = one(right, "expirationDate");
        const termCause = one(right, "terminationCauseName");
        const termDate  = one(right, "terminationDate");
        const fees = [...xml.matchAll(/<registrationFeeInfo>([\s\S]*?)<\/registrationFeeInfo>/g)]
          .map(f => +(one(f[1], "lastAnnual") || 0));
        const maxLast = fees.reduce((a, b) => Math.max(a, b), 0);

        const regD = toDate(regDate);
        let paymentType, nextKind, nextD;
        if (maxLast === 5) {                    // 분할 1회차만 → 2회차 마감 = 등록일+5년
          paymentType = "분할"; nextKind = "분할 2회차"; nextD = regD ? addYears(regD, 5) : null;
        } else if (maxLast > 10) {              // 갱신까지 된 경우 → 다음 갱신 = 존속만료일
          paymentType = "갱신완료"; nextKind = "갱신"; nextD = toDate(expDate) || (regD ? addYears(regD, 10) : null);
        } else if (maxLast >= 10) {             // 일시납(10년) → 갱신 마감 = 존속만료일
          paymentType = "일시"; nextKind = "갱신"; nextD = toDate(expDate) || (regD ? addYears(regD, 10) : null);
        } else {
          paymentType = `기타(${maxLast})`; nextKind = "확인필요"; nextD = toDate(expDate);
        }

        detailMap.set(m.regNo, {
          regNo: m.regNo,
          title: m.title || "",
          type: "상표",
          status: m.status,
          regDate: iso(regD),
          expirationDate: iso(toDate(expDate)),
          maxLastAnnual: maxLast,
          paymentType,
          nextDeadlineKind: nextKind,
          nextDeadline: iso(nextD),
          alive: !termDate,
          terminationCause: termCause || null,
          terminationDate: termDate ? iso(toDate(termDate)) : null,
          checkedAt: new Date().toISOString(),
        });
        processed++;
      } catch (e) {
        // 개별 실패는 건너뜀 (다음 실행에서 재시도)
      }
      await new Promise(rr => setTimeout(rr, 250)); // 레이트리밋 여유
    }

    // ── 4) 최종 데이터 구성 (현재 등록목록 기준으로 재구성) ──
    //   - 이번에 상세 받은 건 → 새 record
    //   - 이전 캐시에 있던 건 → 제목/상태만 목록값으로 갱신해 유지
    //   - 아직 상세 못 받은 신규 건 → detailPending 표시(대시보드에 '조회중')
    const finalData = registered.map(m => {
      if (detailMap.has(m.regNo)) return detailMap.get(m.regNo);
      const old = prevMap.get(m.regNo);
      if (old && !old.detailPending) {
        return { ...old, title: m.title || old.title, status: m.status };
      }
      return {
        regNo: m.regNo, title: m.title || "", type: "상표", status: m.status,
        regDate: iso(toDate(m.regDate)), detailPending: true,
      };
    });

    const withDetail = finalData.filter(x => !x.detailPending).length;
    const remaining = finalData.filter(x => x.detailPending).length;

    // ── 5) Redis 저장 ──
    const meta = {
      lastSync: new Date().toISOString(),
      agent: AGENT,
      totalRegistered: registered.length,
      withDetail, remaining,
    };
    await redisPipeline(R_URL, R_TOK, [
      ["SET", "renewals:data", JSON.stringify(finalData)],
      ["SET", "renewals:meta", JSON.stringify(meta)],
    ]);

    return res.status(200).json({
      ok: true,
      totalRegistered: registered.length,
      withDetail,
      remaining,                         // 아직 상세조회 안 된 건수 (0이면 백필 완료)
      processedThisRun: processed,
      done: remaining === 0,
      tookMs: Date.now() - startedAt,
      hint: remaining > 0
        ? "remaining 이 0이 될 때까지 이 주소를 다시 새로고침하세요(백필 진행 중)."
        : "백필 완료. 이후엔 하루 1회 자동 동기화면 충분합니다.",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
