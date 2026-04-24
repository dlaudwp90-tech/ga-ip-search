// pages/api/kipris.js
// KIPRIS 상표 행정처리 이력 API 프록시
// http → https 우회 + XML → JSON 변환

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { applicationNumber } = req.body;
  if (!applicationNumber) return res.status(400).json({ error: "applicationNumber required" });

  const ACCESS_KEY = process.env.KIPRIS_ACCESS_KEY;
  if (!ACCESS_KEY) return res.status(500).json({ error: "KIPRIS_ACCESS_KEY 환경변수 미설정" });

  // 하이픈 제거: "40-2026-0040463" → "4020260040463"
  const numClean = applicationNumber.replace(/-/g, "");

  try {
    const url = `http://plus.kipris.or.kr/openapi/rest/RelatedDocsonfileTMService/relatedDocsonfileInfo?applicationNumber=${numClean}&accessKey=${encodeURIComponent(ACCESS_KEY)}`;
    const response = await fetch(url);
    const xml = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({ error: "KIPRIS API 오류", raw: xml });
    }

    // XML 파싱 (정규식 기반 — 외부 라이브러리 없이)
    const getTag = (text, tag) => {
      const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
      const matches = [];
      let m;
      while ((m = regex.exec(text)) !== null) matches.push(m[1].trim());
      return matches;
    };

    // resultCode 확인
    const resultCode = getTag(xml, "resultCode")[0] || "";
    const resultMsg  = getTag(xml, "resultMsg")[0] || "";

    // 개별 이력 블록 추출
    const itemBlocks = [];
    const blockRegex = /<relateddocsonfileInfo>([\s\S]*?)<\/relateddocsonfileInfo>/g;
    let bm;
    while ((bm = blockRegex.exec(xml)) !== null) {
      const block = bm[1];
      const g = (tag) => getTag(block, tag)[0] || "";
      itemBlocks.push({
        applicationNumber:   g("applicationNumber"),
        appReferenceNumber:  g("appReferenceNumber"),
        documentNumber:      g("documentNumber"),
        documentDate:        g("documentDate"),       // "20260315" 형식
        documentTitle:       g("documentTitle"),
        documentTitleEng:    g("documentTitleEng"),
        status:              g("status"),
        statusEng:           g("statusEng"),
        step:                g("step"),               // 출원 / 심판 / 등록
        trialNumber:         g("trialNumber"),
        registrationNumber:  g("registrationNumber"),
        regReferenceNumber:  g("regReferenceNumber"),
      });
    }

    // 날짜 포맷 변환: "20260315" → "2026.03.15"
    const fmtDate = (d) => {
      if (!d || d.length !== 8) return d;
      return `${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}`;
    };
    itemBlocks.forEach(it => { it.documentDateFmt = fmtDate(it.documentDate); });

    // 최신 등록번호 추출 (등록 완료 여부 판단)
    const registrationNumber = itemBlocks
      .map(i => i.registrationNumber)
      .find(r => r && r.trim()) || null;

    // 현재 단계 (가장 최근 item 기준)
    const latestStep = itemBlocks.length > 0 ? itemBlocks[itemBlocks.length - 1].step : null;

    return res.status(200).json({
      resultCode,
      resultMsg,
      items: itemBlocks,
      registrationNumber,
      latestStep,
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
