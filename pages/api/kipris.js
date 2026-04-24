// pages/api/kipris.js
// mode: "history" — 출원번호 행정처리이력
// mode: "search"  — 상표명/상품류/유사군 검색

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { mode, applicationNumber, tradeMarkName, classificationCode, similarityCode } = req.body;
  const ACCESS_KEY = process.env.KIPRIS_ACCESS_KEY;
  if (!ACCESS_KEY) return res.status(500).json({ error: "KIPRIS_ACCESS_KEY 환경변수 미설정" });

  // ── XML 파싱 유틸 ──
  const getTagAll = (text, tag) => {
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "g");
    const results = [];
    let m;
    while ((m = regex.exec(text)) !== null) results.push(m[1].trim());
    return results;
  };
  const getTag1 = (text, tag) => getTagAll(text, tag)[0] || "";

  const fmtDate = (d) => {
    if (!d) return "";
    const s = d.replace(/\D/g, "");
    if (s.length === 8) return `${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}`;
    return d;
  };

  // 출원번호 포맷: "4020200012345" → "40-2020-0012345"
  const fmtAppNum = (raw) => {
    const s = (raw || "").replace(/\D/g, "");
    if (s.length === 13) return `${s.slice(0,2)}-${s.slice(2,6)}-${s.slice(6)}`;
    if (s.length === 12) return `${s.slice(0,2)}-${s.slice(2,6)}-${s.slice(6)}`;
    return raw;
  };

  // ─────────────────────────────────────────────
  // 모드 1: 출원번호 행정처리이력
  // ─────────────────────────────────────────────
  if (!mode || mode === "history") {
    if (!applicationNumber) return res.status(400).json({ error: "applicationNumber required" });
    const numClean = applicationNumber.replace(/\D/g, "");
    try {
      const url = `http://plus.kipris.or.kr/openapi/rest/RelatedDocsonfileTMService/relatedDocsonfileInfo?applicationNumber=${numClean}&accessKey=${encodeURIComponent(ACCESS_KEY)}`;
      const resp = await fetch(url);
      const xml  = await resp.text();

      // 결과코드 확인
      const resultCode = getTag1(xml, "resultCode");
      const resultMsg  = getTag1(xml, "resultMsg");

      // 이력 블록 파싱 (relateddocsonfileInfo 또는 item)
      let items = [];
      const blockTags = ["relateddocsonfileInfo", "item"];
      for (const tag of blockTags) {
        const blocks = getTagAll(xml, tag);
        if (blocks.length > 0) {
          items = blocks.map(block => {
            const g = (t) => getTag1(block, t);
            return {
              applicationNumber:  fmtAppNum(g("applicationNumber")),
              documentNumber:     g("documentNumber"),
              documentDate:       g("documentDate"),
              documentDateFmt:    fmtDate(g("documentDate")),
              documentTitle:      g("documentTitle"),
              status:             g("status"),
              step:               g("step"),
              registrationNumber: g("registrationNumber"),
            };
          });
          break;
        }
      }

      const registrationNumber = items.map(i => i.registrationNumber).find(r => r?.trim()) || null;
      const latestItem = items.length > 0 ? items[items.length - 1] : null;
      const latestStep = latestItem?.step || null;

      return res.status(200).json({ resultCode, resultMsg, items, registrationNumber, latestStep, rawLength: xml.length });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ─────────────────────────────────────────────
  // 모드 2: 상표명 / 상품류 / 유사군 검색
  // ─────────────────────────────────────────────
  if (mode === "search") {
    const params = new URLSearchParams({
      numOfRows: "30",
      pageNo: "1",
      accessKey: ACCESS_KEY,
    });
    if (tradeMarkName)      params.append("tradeMarkName",      tradeMarkName);
    if (classificationCode) params.append("classificationCode", classificationCode.replace(/[^0-9]/g, ""));
    if (similarityCode)     params.append("similarityCode",     similarityCode.trim().toUpperCase());

    // 아무 조건도 없으면 거부
    if (!tradeMarkName && !classificationCode && !similarityCode) {
      return res.status(400).json({ error: "검색 조건을 하나 이상 입력해주세요" });
    }

    const url = `http://plus.kipris.or.kr/openapi/rest/TradeMarkSearchService/tradeMarkSearchInfo?${params.toString()}`;

    try {
      const resp = await fetch(url);
      const xml  = await resp.text();

      const resultCode = getTag1(xml, "resultCode");
      const resultMsg  = getTag1(xml, "resultMsg");
      const totalCount = getTag1(xml, "totalCount");

      // item 또는 tradeMarkSearchInfo 블록 파싱
      let items = [];
      for (const tag of ["item", "tradeMarkSearchInfo"]) {
        const blocks = getTagAll(xml, tag);
        if (blocks.length > 0) {
          items = blocks.map(block => {
            const g = (t) => getTag1(block, t);
            const rawNum = g("applicationNumber");
            return {
              applicationNumber:  fmtAppNum(rawNum),
              applicationNumberRaw: rawNum,
              tradeMarkName:      g("tradeMarkName") || g("titleName"),
              drawing:            g("drawing") || g("drawingPath") || g("imageUrl"),
              applicantName:      g("applicantName"),
              applicationDate:    fmtDate(g("applicationDate")),
              registerStatus:     g("registerStatus") || g("registerState"),
              classificationCode: g("classificationCode") || g("goodsClass"),
              registrationNumber: g("registrationNumber"),
              similarityCode:     g("similarityCode"),
            };
          });
          break;
        }
      }

      return res.status(200).json({
        resultCode,
        resultMsg,
        items,
        totalCount: parseInt(totalCount) || items.length,
        debug: { url, xmlLength: xml.length, xmlSnippet: xml.slice(0, 500) },
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: "mode must be 'history' or 'search'" });
}
