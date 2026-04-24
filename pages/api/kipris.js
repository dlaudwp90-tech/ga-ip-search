// pages/api/kipris.js
// mode: "history"  — 출원번호 행정처리이력
// mode: "search"   — 상표명 검색

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { mode, applicationNumber, tradeMarkName } = req.body;
  const ACCESS_KEY = process.env.KIPRIS_ACCESS_KEY;
  if (!ACCESS_KEY) return res.status(500).json({ error: "KIPRIS_ACCESS_KEY 환경변수 미설정" });

  const getTag = (text, tag) => {
    const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`, "g");
    const matches = [];
    let m;
    while ((m = regex.exec(text)) !== null) matches.push(m[1].trim());
    return matches;
  };

  const fmtDate = (d) => {
    if (!d || d.length !== 8) return d;
    return `${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}`;
  };

  // ── 모드 1: 출원번호 행정처리이력 ──
  if (!mode || mode === "history") {
    if (!applicationNumber) return res.status(400).json({ error: "applicationNumber required" });
    const numClean = applicationNumber.replace(/-/g, "");
    try {
      const url = `http://plus.kipris.or.kr/openapi/rest/RelatedDocsonfileTMService/relatedDocsonfileInfo?applicationNumber=${numClean}&accessKey=${encodeURIComponent(ACCESS_KEY)}`;
      const response = await fetch(url);
      const xml = await response.text();

      const blockRegex = /<relateddocsonfileInfo>([\s\S]*?)<\/relateddocsonfileInfo>/g;
      const items = [];
      let bm;
      while ((bm = blockRegex.exec(xml)) !== null) {
        const block = bm[1];
        const g = (tag) => getTag(block, tag)[0] || "";
        items.push({
          applicationNumber:  g("applicationNumber"),
          documentNumber:     g("documentNumber"),
          documentDate:       g("documentDate"),
          documentDateFmt:    fmtDate(g("documentDate")),
          documentTitle:      g("documentTitle"),
          status:             g("status"),
          step:               g("step"),
          registrationNumber: g("registrationNumber"),
        });
      }

      const registrationNumber = items.map(i => i.registrationNumber).find(r => r?.trim()) || null;
      const latestStep = items.length > 0 ? items[items.length - 1].step : null;
      const resultCode = getTag(xml, "resultCode")[0] || "";

      return res.status(200).json({ resultCode, items, registrationNumber, latestStep });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── 모드 2: 상표명 검색 ──
  if (mode === "search") {
    if (!tradeMarkName) return res.status(400).json({ error: "tradeMarkName required" });
    try {
      const url = `http://plus.kipris.or.kr/openapi/rest/TradeMarkSearchService/tradeMarkSearchInfo?numOfRows=30&pageNo=1&tradeMarkName=${encodeURIComponent(tradeMarkName)}&accessKey=${encodeURIComponent(ACCESS_KEY)}`;
      const response = await fetch(url);
      const xml = await response.text();

      const blockRegex = /<tradeMarkSearchInfo>([\s\S]*?)<\/tradeMarkSearchInfo>/g;
      const items = [];
      let bm;
      while ((bm = blockRegex.exec(xml)) !== null) {
        const block = bm[1];
        const g = (tag) => getTag(block, tag)[0] || "";
        items.push({
          applicationNumber:  g("applicationNumber"),
          tradeMarkName:      g("tradeMarkName"),
          drawing:            g("drawing"),
          applicantName:      g("applicantName"),
          applicationDate:    fmtDate(g("applicationDate")),
          registerStatus:     g("registerStatus"),
          classificationCode: g("classificationCode"),
          registrationNumber: g("registrationNumber"),
        });
      }

      const totalCount = getTag(xml, "totalCount")[0] || "0";
      return res.status(200).json({ items, totalCount: parseInt(totalCount) || items.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: "mode must be 'history' or 'search'" });
}
