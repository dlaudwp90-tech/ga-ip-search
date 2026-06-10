// pages/api/kipris-test.js
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ [임시 점검용 · 1회성] 상표 분할납부(5년) vs 일시납(10년)을 KIPRIS 응답으로
//    구분할 수 있는지 확인하기 위한 테스트 라우트입니다. 판단이 끝나면 삭제해도 됩니다.
//
//  - kipris-sync.js 와 "똑같은" KIPRIS 서비스(RelatedDocsonfileTMService)와
//    키(KIPRIS_ACCESS_KEY)를 그대로 재사용합니다 → 키/엔드포인트 문제 없이 바로 동작.
//  - 출원번호별로 '서류 이력 전체(step·status·문서명·날짜·등록번호)' + 원본 XML을 그대로 돌려줍니다.
//    (분할납부 흔적이 문서명/단계에 들어있는지 두 건을 비교해 보려는 목적)
//
//  ▶ 사용법 (비개발자용):
//    1) 이 파일을 GitHub의  pages/api/kipris-test.js  로 올립니다.
//    2) 배포 후 브라우저에서 아래 주소를 엽니다(시크릿은 kipris-sync 와 동일):
//         https://staff.markangel.co.kr/api/kipris-test?secret=ga-sync-2026
//       (다른 번호로 보고 싶으면:  ...&apps=40-2025-0091177,40-2025-0094208 )
//    3) 화면에 나온 JSON 전체를 복사해서 그대로 붙여주세요.
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // 간단 보호: 시크릿이 맞을 때만 동작 (KIPRIS 키 오남용 방지)
  const SYNC_SECRET = process.env.KIPRIS_SYNC_SECRET || "ga-sync-2026";
  if ((req.query.secret || "") !== SYNC_SECRET) {
    return res.status(401).json({ error: "Unauthorized — 주소 뒤에 ?secret=... 값을 확인하세요" });
  }

  const ACCESS_KEY = process.env.KIPRIS_ACCESS_KEY;
  if (!ACCESS_KEY) return res.status(500).json({ error: "KIPRIS_ACCESS_KEY 환경변수 미설정" });

  // 점검 대상 출원번호 (기본값 = 주신 2건. ?apps=a,b 로 바꿀 수 있음)
  const apps = (req.query.apps
    ? String(req.query.apps).split(",")
    : ["40-2025-0091177", "40-2025-0094208"]
  ).map(s => s.trim()).filter(Boolean);

  // XML 태그 추출 헬퍼 (kipris-sync.js 와 동일한 방식)
  const getTag = (text, tag) => {
    const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
    const out = []; let m;
    while ((m = re.exec(text)) !== null) out.push(m[1].trim());
    return out;
  };

  const result = {};

  for (const app of apps) {
    const numClean = app.replace(/-/g, "");
    const url = `http://plus.kipris.or.kr/openapi/rest/RelatedDocsonfileTMService/relatedDocsonfileInfo`
              + `?applicationNumber=${numClean}&accessKey=${encodeURIComponent(ACCESS_KEY)}`;
    try {
      const r = await fetch(url);
      const xml = await r.text();

      // 서류 이력 블록 전체를 파싱 (어떤 문서/단계들이 있는지 통째로 보기 위함)
      const blockRe = /<relateddocsonfileInfo>([\s\S]*?)<\/relateddocsonfileInfo>/g;
      const items = []; let bm;
      while ((bm = blockRe.exec(xml)) !== null) {
        const b = bm[1];
        const g = (tag) => getTag(b, tag)[0] || "";
        items.push({
          step:               g("step"),
          status:             g("status"),
          documentTitle:      g("documentTitle"),
          documentDate:       g("documentDate"),
          registrationNumber: g("registrationNumber"),
        });
      }

      result[app] = {
        httpStatus: r.status,
        count: items.length,
        items,        // 사람이 보기 쉬운 요약 (문서명 목록)
        rawXml: xml,  // 혹시 다른 필드가 있을 수 있으니 원본도 함께 (이게 길면 items만 붙여도 됩니다)
      };
    } catch (e) {
      result[app] = { error: e.message };
    }

    // KIPRIS 레이트리밋 여유
    await new Promise(rr => setTimeout(rr, 300));
  }

  res.status(200).json(result);
}
