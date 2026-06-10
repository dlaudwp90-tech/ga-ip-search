// pages/api/kipris-fee-test.js
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ [임시 점검용 · 1회성] 상표 "분할납부(5년) vs 일시납(10년)"을 KIPRIS로 자동 구분할 수
//    있는지 확인하는 테스트 라우트입니다. 판단이 끝나면 삭제해도 됩니다.
//
//  - 사용하는 KIPRIS 서비스: RegistrationService / registrationFeeInfo (= "등록료정보")
//      · 입력: registrationNumber(등록번호, 13자리)
//      · 출력(블록마다): 등록일자·시작연차·마지막연차·납부차수·납부금액·납부일자
//  - 기존 kipris-sync.js 와 "같은 키(KIPRIS_ACCESS_KEY)"를 그대로 사용합니다.
//      ※ 단, 이 키가 'RegistrationService(등록사항)' 서비스에 구독돼 있어야 동작합니다.
//        만약 권한/인증 에러가 나오면 → KIPRIS Plus 마이페이지에서 해당 서비스 구독을 추가하세요.
//
//  ▶ 사용법 (비개발자용):
//    1) 이 파일을 GitHub의  pages/api/kipris-fee-test.js  로 올립니다.
//    2) 배포 후 브라우저에서 아래 주소를 엽니다:
//         https://staff.markangel.co.kr/api/kipris-fee-test?secret=ga-sync-2026
//       (기본 등록번호 = 4024140350000 일시납, 4024314180000 분할.
//        다른 번호로 보려면:  ...&regs=4024140350000,4024314180000 )
//    3) 화면에 나온 JSON 전체(또는 각 번호의 items 배열)를 복사해서 붙여주세요.
//
//  ▶ 무엇을 보는가 (분할/일시 판별 가설):
//      · 일시납(10년)        → 블록 1개, lastAnnual=10 (또는 금액이 10년분)
//      · 분할 1회차(5년)     → 블록 1개, lastAnnual=5  (또는 금액이 5년분)
//      · 분할 2회차까지 완납  → 블록 2개 (1~5년 / 6~10년)
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // 간단 보호: 시크릿이 맞을 때만 동작
  const SYNC_SECRET = process.env.KIPRIS_SYNC_SECRET || "ga-sync-2026";
  if ((req.query.secret || "") !== SYNC_SECRET) {
    return res.status(401).json({ error: "Unauthorized — 주소 뒤 ?secret=... 값을 확인하세요" });
  }

  const ACCESS_KEY = process.env.KIPRIS_ACCESS_KEY;
  if (!ACCESS_KEY) return res.status(500).json({ error: "KIPRIS_ACCESS_KEY 환경변수 미설정" });

  // 점검 대상 등록번호 (기본 = 앞서 확보한 2건. ?regs=a,b 로 변경 가능. 하이픈은 자동 제거)
  const regs = (req.query.regs
    ? String(req.query.regs).split(",")
    : ["4024140350000", "4024314180000"]
  ).map(s => s.trim().replace(/-/g, "")).filter(Boolean);

  // XML 태그 추출 헬퍼 (kipris-sync.js 와 동일 방식)
  const getTag = (text, tag) => {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
    const out = []; let m;
    while ((m = re.exec(text)) !== null) out.push(m[1].trim());
    return out;
  };

  const result = {};

  for (const reg of regs) {
    const url = `http://plus.kipris.or.kr/openapi/rest/RegistrationService/registrationFeeInfo`
              + `?registrationNumber=${reg}&accessKey=${encodeURIComponent(ACCESS_KEY)}`;
    try {
      const r = await fetch(url);
      const xml = await r.text();

      // 등록료 납부 블록 전체 파싱
      const blockRe = /<registrationFeeInfo>([\s\S]*?)<\/registrationFeeInfo>/g;
      const items = []; let bm;
      while ((bm = blockRe.exec(xml)) !== null) {
        const b = bm[1];
        const g = (t) => getTag(b, t)[0] || "";
        items.push({
          registrationDate: g("registrationDate"), // 등록일자(연차 기준일)
          startAnnual:      g("startAnnual"),       // 시작연차
          lastAnnual:       g("lastAnnual"),        // 마지막연차  ← 5 vs 10 이 분할/일시 단서
          paymentDegree:    g("paymentDegree"),     // 납부차수
          paymentFee:       g("paymentFee"),        // 납부금액   ← 금액으로도 분할/일시 구분
          paymentDate:      g("paymentDate"),       // 납부일자
        });
      }

      result[reg] = {
        httpStatus: r.status,
        count: items.length,
        items,        // 사람이 보기 쉬운 요약
        rawXml: xml,  // 권한 에러/다른 필드 확인용 원본 (이게 길면 items만 붙여도 됩니다)
      };
    } catch (e) {
      result[reg] = { error: e.message };
    }

    // KIPRIS 레이트리밋 여유
    await new Promise(rr => setTimeout(rr, 300));
  }

  res.status(200).json(result);
}
