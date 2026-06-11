// pages/api/kipris-daily-sync.js
// ─────────────────────────────────────────────────────────────────────────────
// 【연차/갱신 관리 - 동기화 함수 v2】  ⚠ 수정 주의: 데이터 적재 로직입니다.
//
//  하는 일: 김수산 대리인의 '등록 상표 + 등록 디자인'을 KIPRIS에서 가져와
//           각 권리의 연차/갱신 마감을 계산해 Redis(renewals:data)에 캐시합니다.
//           대시보드(renewals.js)는 이 캐시만 읽습니다(KIPRIS 0회).
//
//  ★ KIPRIS 호출 최소화 ★
//   - 목록 조회: 하루 상표 1~2회 + 디자인 1회 (이미지·권리자·상태·명칭도 여기서 함께 옴)
//   - 상세 조회(연차/분할/존속만료): "처음 보는 등록번호" + "마감 9개월 창에 들어왔고
//     7일 이상 재확인 안 한 건"만. 한번 받은 정적 데이터는 다시 안 부릅니다.
//   - 자주 변하는 정보(대리인·권리자·상태·명칭·이미지)는 매일 목록값으로 덮어써 항상 최신 유지.
//   - 안 변하는 정보(등록일·분할/일시)는 캐시.
//
//  필요한 환경변수: KIPRIS_ACCESS_KEY / UPSTASH_REDIS_REST_URL / _TOKEN /
//                  KIPRIS_SYNC_SECRET(기본 ga-sync-2026) / KIPRIS_AGENT_CODE(기본 920210007229)
//
//  ▶ 백필/운영:
//    https://staff.markangel.co.kr/api/kipris-daily-sync?secret=ga-sync-2026
//      - 처음엔 remaining 이 0 될 때까지 새로고침(상표+디자인 상세 백필)
//      - 평소엔 Vercel Cron이 하루 1회 자동 호출
//    전체 재조회(가끔, 권리자/상태 강제 최신화):  ...&full=1   ← remaining 0 될 때까지 반복
// ─────────────────────────────────────────────────────────────────────────────

export const config = { maxDuration: 60 };

async function redisPipeline(url, token, commands) {
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}: ${await res.text()}`);
  return res.json();
}

export default async function handler(req, res) {
  const startedAt = Date.now();
  const SYNC_SECRET = process.env.KIPRIS_SYNC_SECRET || "ga-sync-2026";
  const given = req.query.secret || req.headers["x-sync-secret"] || "";
  if (given !== SYNC_SECRET) return res.status(401).json({ error: "Unauthorized" });

  const ACCESS_KEY = process.env.KIPRIS_ACCESS_KEY;
  const R_URL = process.env.UPSTASH_REDIS_REST_URL;
  const R_TOK = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!ACCESS_KEY) return res.status(500).json({ error: "KIPRIS_ACCESS_KEY 미설정" });
  if (!R_URL || !R_TOK) return res.status(500).json({ error: "UPSTASH_REDIS_REST_URL/TOKEN 미설정" });

  const AGENT = process.env.KIPRIS_AGENT_CODE || "920210007229";
  const KEY = encodeURIComponent(ACCESS_KEY);
  const FULL = req.query.full === "1"; // 전체 상세 재조회 모드

  const MAX_FETCHES = Math.min(parseInt(req.query.max || "50", 10) || 50, 200);
  const TIME_BUDGET_MS = 45000;
  const ALERT_MONTHS = 9, RECHECK_DAYS = 7;

  // ── XML/날짜 헬퍼 ──
  const getTag = (t, tag) => {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"); const out = []; let m;
    while ((m = re.exec(t)) !== null) out.push(m[1].trim()); return out;
  };
  const one = (t, tag) => getTag(t, tag)[0] || "";
  const oneOf = (t, tags) => { for (const tag of tags) { const v = one(t, tag); if (v) return v; } return ""; };
  const toDate = (s) => { if (!s) return null; const x = s.replace(/-/g, ""); return x.length >= 8 ? new Date(+x.slice(0,4), +x.slice(4,6)-1, +x.slice(6,8)) : null; };
  const addYears = (d, y) => { const n = new Date(d); n.setFullYear(n.getFullYear()+y); return n; };
  const addMonths = (d, mm) => { const n = new Date(d); n.setMonth(n.getMonth()+mm); return n; };
  const iso = (d) => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` : "";

  try {
    // ── 0) 기존 캐시 ──
    let prev = [];
    try { const r = await redisPipeline(R_URL, R_TOK, [["GET", "renewals:data"]]); const raw = r?.[0]?.result; if (raw) prev = JSON.parse(raw); } catch { prev = []; }
    const prevMap = new Map(prev.map(x => [x.regNo, x]));

    // ── 1) 상표 목록 (이미지·권리자 포함) ──
    const fetchTM = async (page) => {
      const url = `http://plus.kipris.or.kr/openapi/rest/trademarkInfoSearchService/agentNamesearchInfo`
        + `?agentName=${encodeURIComponent(AGENT)}&registration=true&docsStart=${page}&docsCount=500&sortSpec=RD&descSort=true&accessKey=${KEY}`;
      const xml = await (await fetch(url)).text();
      const total = parseInt(one(xml, "TotalSearchCount") || "0", 10);
      const marks = [...xml.matchAll(/<TradeMarkInfo>([\s\S]*?)<\/TradeMarkInfo>/g)].map(m => m[1]).map(b => ({
        type: "상표",
        title: one(b, "Title"),
        regNo: one(b, "RegistrationNumber"),
        regDate: one(b, "RegistrationDate"),
        appNo: one(b, "ApplicationNumber"),
        appDate: one(b, "ApplicationDate"),
        classCode: one(b, "GoodClassificationCode"),
        status: one(b, "ApplicationStatus"),
        holder: one(b, "RegistrationRightholderName"),
        image: one(b, "ImagePath"),
        thumb: one(b, "ThumbnailPath"),
      }));
      return { total, marks };
    };

    // ── 1-2) 디자인 목록 (designInfoSearchService — 실제 스펙 반영) ──
    //   주의: 상표와 다른 점 → 오퍼레이션 'agentNameSearchInfo'(대문자 S),
    //        페이지 파라미터 'startNumber', 전체건수 태그 'totalCount', 이미지 imagePath/imagePathLarge
    let designListError = null;
    const fetchDS = async (page) => {
      const url = `http://plus.kipris.or.kr/openapi/rest/designInfoSearchService/agentNameSearchInfo`
        + `?agentName=${encodeURIComponent(AGENT)}&registration=true&startNumber=${page}&docsCount=500&sortSpec=RD&descSort=true&accessKey=${KEY}`;
      const xml = await (await fetch(url)).text();
      const code = one(xml, "resultCode");
      if (code && code !== "00") designListError = `resultCode ${code}: ${one(xml, "resultMsg")}`;
      const total = parseInt(one(xml, "totalCount") || "0", 10);
      const blocks = [...xml.matchAll(/<DesignInfo>([\s\S]*?)<\/DesignInfo>/g)].map(m => m[1]);
      const marks = blocks.map(b => ({
        type: "디자인",
        title:  one(b, "articleName"),          // 디자인 물품명
        regNo:  one(b, "registrationNumber"),
        regDate:one(b, "registrationDate"),
        appNo:  one(b, "applicationNumber"),
        appDate:one(b, "applicationDate"),
        classCode: one(b, "designMainClassification"),
        status: one(b, "applicationStatus"),
        holder: one(b, "applicantName"),        // 디자인 응답엔 출원인명만 있음
        image:  one(b, "imagePathLarge") || one(b, "imagePath"),  // 큰 이미지(없으면 작은 것)
        thumb:  one(b, "imagePath") || one(b, "imagePathLarge"),  // 작은 이미지
      }));
      return { total, marks };
    };

    const collect = async (fetcher) => {
      const first = await fetcher(1);
      let all = first.marks;
      const pages = Math.min(Math.ceil((first.total || 0) / 500), 10);
      for (let p = 2; p <= pages; p++) all = all.concat((await fetcher(p)).marks);
      return all;
    };

    const tmMarks = await collect(fetchTM);
    let dsMarks = [];
    try { dsMarks = await collect(fetchDS); } catch (e) { designListError = e.message; }

    // 등록(살아있음) + 국내 등록번호(13자리)만, 중복 제거
    const seen = new Set();
    const registered = [...tmMarks, ...dsMarks].filter(m => {
      const ok = (m.status || "").includes("등록") && /^\d{13}$/.test(m.regNo) && !seen.has(m.regNo);
      if (ok) seen.add(m.regNo);
      return ok;
    });

    // ── 2) 상세조회 대상 선정 ──
    const now = new Date();
    const needDetail = (rec) => {
      if (FULL) return true;                       // 전체 재조회 모드
      if (!rec || rec.detailPending) return true;  // 신규/미완성
      if (!rec.nextDeadline) return false;
      const dl = toDate(rec.nextDeadline);
      if (!dl || dl > addMonths(now, ALERT_MONTHS)) return false; // 9개월 창 밖이면 불필요
      const checked = rec.checkedAt ? new Date(rec.checkedAt) : null;
      return !checked || (now - checked) > RECHECK_DAYS * 86400000; // 창 안 + 7일 경과
    };
    const todo = registered.filter(m => needDetail(prevMap.get(m.regNo)));

    // ── 3) 상세조회 (등록사항: 상표/디자인 공통) ──
    let processed = 0;
    const detailMap = new Map();
    for (const m of todo) {
      if (processed >= MAX_FETCHES || Date.now() - startedAt > TIME_BUDGET_MS) break;
      try {
        const url = `http://plus.kipris.or.kr/openapi/rest/RegistrationService/registrationInfo?registrationNumber=${m.regNo}&accessKey=${KEY}`;
        const xml = await (await fetch(url)).text();
        const right = (xml.match(/<registrationRightInfo>([\s\S]*?)<\/registrationRightInfo>/) || [])[1] || "";
        const regDate   = one(right, "registrationDate") || m.regDate;
        const expDate   = one(right, "expirationDate");
        const termDate  = one(right, "terminationDate");
        const termCause = one(right, "terminationCauseName");
        const maxLast = [...xml.matchAll(/<registrationFeeInfo>([\s\S]*?)<\/registrationFeeInfo>/g)]
          .map(f => +(one(f[1], "lastAnnual") || 0)).reduce((a, b) => Math.max(a, b), 0);

        const regD = toDate(regDate), expD = toDate(expDate);
        let paymentType, nextKind, nextD;

        if (m.type === "디자인") {
          // 디자인 = 연차료(매년). 다음 연차 = 등록일+maxLast년(그 전까지 납부). 존속만료 넘으면 더 없음.
          const annDue = regD ? addYears(regD, maxLast) : null;
          if (annDue && expD && annDue > expD) { paymentType = `연차 ${maxLast}년차(만료도달)`; nextKind = "존속만료"; nextD = expD; }
          else { paymentType = `연차 ${maxLast}년차 완료`; nextKind = "연차료"; nextD = annDue; }
        } else {
          // 상표 = 분할(5)/일시(10)/갱신
          if (maxLast === 5)       { paymentType = "분할";     nextKind = "분할 2회차"; nextD = regD ? addYears(regD, 5) : null; }
          else if (maxLast > 10)   { paymentType = "갱신완료"; nextKind = "갱신";       nextD = expD || (regD ? addYears(regD, 10) : null); }
          else if (maxLast >= 10)  { paymentType = "일시";     nextKind = "갱신";       nextD = expD || (regD ? addYears(regD, 10) : null); }
          else                     { paymentType = `기타(${maxLast})`; nextKind = "확인필요"; nextD = expD; }
        }

        detailMap.set(m.regNo, {
          regNo: m.regNo, type: m.type, title: m.title || "", status: m.status,
          holder: m.holder || "", image: m.image || "", thumb: m.thumb || "",
          appNo: m.appNo || "", appDate: iso(toDate(m.appDate)), classCode: m.classCode || "",
          regDate: iso(regD), expirationDate: iso(expD),
          maxLastAnnual: maxLast, paymentType, nextDeadlineKind: nextKind, nextDeadline: iso(nextD),
          alive: !termDate, terminationCause: termCause || null, terminationDate: termDate ? iso(toDate(termDate)) : null,
          checkedAt: new Date().toISOString(),
        });
        processed++;
      } catch (e) { /* 개별 실패는 다음 실행에서 재시도 */ }
      await new Promise(rr => setTimeout(rr, 250));
    }

    // ── 4) 최종 데이터 구성 (현재 목록 기준 + 자주 변하는 필드는 목록값으로 갱신) ──
    const finalData = registered.map(m => {
      const volatile = { title: m.title || "", status: m.status, holder: m.holder || "", image: m.image || "", thumb: m.thumb || "", appNo: m.appNo || "", appDate: iso(toDate(m.appDate)), classCode: m.classCode || "" };
      if (detailMap.has(m.regNo)) return detailMap.get(m.regNo);
      const old = prevMap.get(m.regNo);
      if (old && !old.detailPending) return { ...old, ...volatile }; // 상세는 유지, 변동필드만 최신화
      return { regNo: m.regNo, type: m.type, ...volatile, regDate: iso(toDate(m.regDate)), detailPending: true };
    });

    const withDetail = finalData.filter(x => !x.detailPending).length;
    const remaining = finalData.filter(x => x.detailPending).length;
    const meta = {
      lastSync: new Date().toISOString(), agent: AGENT,
      totalRegistered: registered.length,
      trademarkRegistered: registered.filter(x => x.type === "상표").length,
      designRegistered: registered.filter(x => x.type === "디자인").length,
      withDetail, remaining, designListError,
    };
    await redisPipeline(R_URL, R_TOK, [
      ["SET", "renewals:data", JSON.stringify(finalData)],
      ["SET", "renewals:meta", JSON.stringify(meta)],
    ]);

    return res.status(200).json({
      ok: true, ...meta, processedThisRun: processed, done: remaining === 0,
      tookMs: Date.now() - startedAt,
      hint: remaining > 0 ? "remaining 0 될 때까지 새로고침(백필 진행 중)."
        : "완료. designRegistered / designListError 값 확인하세요.",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
