// pages/api/kipris-portfolio-test.js
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ [임시 검증용 · 1회성] "연차/갱신 관리" 대시보드를 만들기 전에, 전체 데이터 흐름을
//    실제 김수산 대리인 데이터로 끝까지 돌려보는 파이프라인 점검 라우트입니다.
//
//  흐름:
//    1) trademarkInfoSearchService/agentNamesearchInfo  → 대리인의 '등록 상표' 목록(등록번호·등록일·상태·상표명)
//    2) RegistrationService/registrationInfo            → 각 등록번호의 존속만료일·소멸여부·연차납부이력
//    3) 분할/일시 판정 + 다음 마감 계산                  → 분할 2회차(+5년) / 갱신(+10년)
//
//  ※ 기존 kipris-sync.js 와 같은 키(KIPRIS_ACCESS_KEY) 사용.
//    이번엔 'trademarkInfoSearchService' 와 'RegistrationService' 두 서비스 구독이 필요합니다.
//    (RegistrationService 는 앞서 구독 완료. trademarkInfoSearchService 가 막히면 그 서비스도 활용신청 필요)
//
//  ▶ 사용법:
//    1) 이 파일을 GitHub의  pages/api/kipris-portfolio-test.js  로 올립니다.
//    2) 브라우저에서:
//         https://staff.markangel.co.kr/api/kipris-portfolio-test?secret=ga-sync-2026
//       (대리인명 바꾸려면 &agent=김수산 / 처리건수 늘리려면 &limit=8 — 호출수 아끼려 기본 8건만 상세조회)
//    3) 나온 JSON 을 붙여주세요.
//
//  ▶ 확인 포인트:
//    · summary.agentNameSample 에 우리 사무소가 맞게 잡히는지(= agent 파라미터가 올바른지)
//    · 각 행의 paymentType(분할/일시)·nextDeadline(다음 마감)·daysLeft(남은 일수)가 상식과 맞는지
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // 간단 보호
  const SYNC_SECRET = process.env.KIPRIS_SYNC_SECRET || "ga-sync-2026";
  if ((req.query.secret || "") !== SYNC_SECRET) {
    return res.status(401).json({ error: "Unauthorized — ?secret= 확인" });
  }
  const ACCESS_KEY = process.env.KIPRIS_ACCESS_KEY;
  if (!ACCESS_KEY) return res.status(500).json({ error: "KIPRIS_ACCESS_KEY 미설정" });

  const AGENT = (req.query.agent || "김수산").trim();          // 조회할 대리인명(또는 대리인번호)
  const LIMIT = Math.min(parseInt(req.query.limit || "8", 10) || 8, 20); // 상세조회 건수(호출수 보호)
  const KEY = encodeURIComponent(ACCESS_KEY);

  // ── 공통 XML 헬퍼 ──
  const getTag = (text, tag) => {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
    const out = []; let m;
    while ((m = re.exec(text)) !== null) out.push(m[1].trim());
    return out;
  };
  const one = (text, tag) => getTag(text, tag)[0] || "";

  // ── 날짜 헬퍼 (YYYYMMDD 문자열 기준) ──
  const toDate = (s) => (s && s.length >= 8) ? new Date(+s.slice(0,4), +s.slice(4,6)-1, +s.slice(6,8)) : null;
  const addYears = (d, y) => { const n = new Date(d); n.setFullYear(n.getFullYear() + y); return n; };
  const fmt = (d) => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` : "";
  const daysLeft = (d) => d ? Math.round((d - new Date()) / 86400000) : null;

  try {
    // ── 1단계: 대리인의 등록 상표 목록 ──
    const searchUrl =
      `http://plus.kipris.or.kr/openapi/rest/trademarkInfoSearchService/agentNamesearchInfo` +
      `?agentName=${encodeURIComponent(AGENT)}` +
      `&registration=true&docsStart=1&docsCount=500&sortSpec=RD&descSort=true&accessKey=${KEY}`;

    const sr = await fetch(searchUrl);
    const sxml = await sr.text();
    const totalSearchCount = one(sxml, "TotalSearchCount");

    // TradeMarkInfo 블록 전체 파싱
    const markBlocks = [...sxml.matchAll(/<TradeMarkInfo>([\s\S]*?)<\/TradeMarkInfo>/g)].map(m => m[1]);
    const marks = markBlocks.map(b => ({
      title:        one(b, "Title"),
      appNo:        one(b, "ApplicationNumber"),
      regNo:        one(b, "RegistrationNumber"),
      regDate:      one(b, "RegistrationDate"),
      status:       one(b, "ApplicationStatus"),
      agentName:    one(b, "AgentName"),
      classCode:    one(b, "GoodClassificationCode"),
    }));

    // 등록(살아있는) + 국내 등록번호(13자리) 있는 것만, 등록번호 기준 중복 제거
    const seen = new Set();
    const registered = marks.filter(m => {
      const ok = m.status.includes("등록") && /^\d{13}$/.test(m.regNo) && !seen.has(m.regNo);
      if (ok) seen.add(m.regNo);
      return ok;
    });

    // ── 2단계: 앞쪽 LIMIT건만 등록상세 조회 (호출수 보호) ──
    const rows = [];
    for (const m of registered.slice(0, LIMIT)) {
      const infoUrl =
        `http://plus.kipris.or.kr/openapi/rest/RegistrationService/registrationInfo` +
        `?registrationNumber=${m.regNo}&accessKey=${KEY}`;
      let detail = { error: null };
      try {
        const ir = await fetch(infoUrl);
        const ixml = await ir.text();

        // 권리정보 블록(존속만료/소멸 등)
        const right = (ixml.match(/<registrationRightInfo>([\s\S]*?)<\/registrationRightInfo>/) || [])[1] || "";
        const regDate     = one(right, "registrationDate") || m.regDate;
        const expDate     = one(right, "expirationDate");          // 존속기간만료일자(API)
        const termCause   = one(right, "terminationCauseName");    // 소멸원인(있으면 죽은 권리)
        const termDate    = one(right, "terminationDate");

        // 연차 납부이력 → 분할/일시 판정
        const fees = [...ixml.matchAll(/<registrationFeeInfo>([\s\S]*?)<\/registrationFeeInfo>/g)].map(f => ({
          startAnnual:   +(one(f[1], "startAnnual") || 0),
          lastAnnual:    +(one(f[1], "lastAnnual") || 0),
          paymentDegree:  one(f[1], "paymentDegree"),
          paymentFee:     one(f[1], "paymentFee"),
        }));
        const maxLast = fees.reduce((a, b) => Math.max(a, b.lastAnnual), 0);

        // 판정 + 다음 마감 계산
        const alive = !termDate;                       // 소멸일자 없으면 살아있음
        let paymentType, nextDeadlineDate, deadlineKind;
        if (maxLast === 5) {
          paymentType  = "상표 분할(5년·2회차 미납)";
          deadlineKind = "분할 2회차 납부";
          nextDeadlineDate = addYears(toDate(regDate), 5);     // 등록일+5년
        } else if (maxLast >= 10) {
          paymentType  = "상표 일시납/분할완납(10년)";
          deadlineKind = "갱신";
          nextDeadlineDate = expDate ? toDate(expDate) : addYears(toDate(regDate), 10); // 존속만료일(=갱신 기준)
        } else {
          paymentType  = `기타(최대연차 ${maxLast})`;
          deadlineKind = "확인필요";
          nextDeadlineDate = expDate ? toDate(expDate) : null;
        }

        detail = {
          regDate,
          expirationDateApi: expDate,    // API가 주는 존속만료일 (분할이면 +5년으로 나오는지 비교용)
          alive,
          terminationCause: termCause || null,
          terminationDate: termDate || null,
          maxLastAnnual: maxLast,
          feeBlocks: fees.length,
          paymentType,
          deadlineKind,
          nextDeadline: alive ? fmt(nextDeadlineDate) : null,
          daysLeft: alive ? daysLeft(nextDeadlineDate) : null,
        };
      } catch (e) {
        detail = { error: e.message };
      }

      rows.push({ title: m.title, regNo: m.regNo, status: m.status, ...detail });
      await new Promise(r => setTimeout(r, 300)); // 레이트리밋 여유
    }

    // 살아있는 건만 임박순 정렬
    rows.sort((a, b) => {
      if (a.daysLeft == null) return 1;
      if (b.daysLeft == null) return -1;
      return a.daysLeft - b.daysLeft;
    });

    return res.status(200).json({
      summary: {
        agentQueried: AGENT,
        agentNameSample: registered[0]?.agentName || marks[0]?.agentName || "(결과없음)",
        totalSearchCount,                 // 검색에 잡힌 전체 건수
        registeredFound: registered.length, // 등록·국내번호 보유 건수
        detailProcessed: rows.length,     // 이번에 상세조회한 건수(=LIMIT 이내)
        note: "agentNameSample 이 우리 사무소가 맞는지 먼저 확인하세요. 다르면 ?agent= 에 정확한 대리인명/번호를 넣어 재실행.",
      },
      rows,
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
