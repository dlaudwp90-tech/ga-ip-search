// pages/api/kipris.js  v4
//
// mode: "history"    — 출원번호 행정처리이력 (상표40- / 디자인30- 자동분기)
// mode: "search"     — 상표명/출원인/대리인 검색 (페이지네이션)
// mode: "detail"     — 상표 상세 (서지+지정상품+출원인 병렬조회)
// mode: "rejection"  — 거절결정서 검색
// mode: "register"   — 등록결정서 조회

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const ACCESS_KEY = process.env.KIPRIS_ACCESS_KEY;
  if (!ACCESS_KEY) return res.status(500).json({ error: "KIPRIS_ACCESS_KEY 미설정" });

  const {
    mode, applicationNumber,
    tradeMarkName, classificationCode, similarityCode, applicantName, agentName, pageNo,
    word, rejectionContent, sendDate,
  } = req.body;

  // XML 파싱
  const getAll = (t, tag) => {
    const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "g");
    const out = []; let m;
    while ((m = r.exec(t)) !== null) out.push(m[1].trim());
    return out;
  };
  const get1 = (t, tag) => getAll(t, tag)[0] || "";
  const fmtDate = (d) => {
    if (!d) return "";
    const s = d.replace(/\D/g, "");
    return s.length === 8 ? `${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}` : d;
  };
  const fmtAppNum = (raw) => {
    const s = (raw || "").replace(/\D/g, "");
    return s.length === 13 ? `${s.slice(0,2)}-${s.slice(2,6)}-${s.slice(6)}` : raw;
  };
  const detectService = (a) => ((a || "").replace(/\D/g,"").slice(0,2) === "30" ? "DG" : "TM");

  // ════════════════════════════════════════════
  // MODE: history
  // ════════════════════════════════════════════
  if (!mode || mode === "history") {
    if (!applicationNumber) return res.status(400).json({ error: "applicationNumber required" });
    const numClean = applicationNumber.replace(/\D/g, "");
    const svc = detectService(applicationNumber);
    const urlMap = {
      TM: `http://plus.kipris.or.kr/openapi/rest/RelatedDocsonfileTMService/relatedDocsonfileInfo?applicationNumber=${numClean}&accessKey=${encodeURIComponent(ACCESS_KEY)}`,
      DG: `http://plus.kipris.or.kr/openapi/rest/RelatedDocsonfileDGService/relatedDocsonfileInfo?applicationNumber=${numClean}&accessKey=${encodeURIComponent(ACCESS_KEY)}`,
    };
    try {
      const xml = await (await fetch(urlMap[svc])).text();
      let items = [];
      for (const tag of ["relateddocsonfileInfo", "item"]) {
        const blocks = getAll(xml, tag);
        if (blocks.length > 0) {
          items = blocks.map(b => {
            const g = (t) => get1(b, t);
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
      const latestStep = items.length > 0 ? items[items.length-1].step : null;
      return res.status(200).json({
        resultCode: get1(xml, "resultCode"), items, registrationNumber, latestStep, serviceType: svc,
      });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ════════════════════════════════════════════
  // MODE: search (상표명/출원인/대리인 + 페이지네이션)
  // ════════════════════════════════════════════
  if (mode === "search") {
    if (!tradeMarkName && !classificationCode && !similarityCode && !applicantName && !agentName) {
      return res.status(400).json({ error: "검색 조건을 하나 이상 입력해주세요" });
    }
    const params = new URLSearchParams({
      ServiceKey: ACCESS_KEY,
      searchRecentYear: "0",
      numOfRows: "30",
      pageNo: String(pageNo || 1),
    });
    // KIPRIS 검색식 기호 그대로 전달 (+, *, 등)
    if (tradeMarkName)      params.append("searchString",       tradeMarkName);
    if (applicantName)      params.append("applicantName",      applicantName);
    if (agentName)          params.append("agentName",          agentName);
    if (classificationCode) params.append("classificationCode", classificationCode.replace(/[^0-9,]/g,""));

    const url = `http://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService/getWordSearch?${params.toString()}`;
    try {
      const xml = await (await fetch(url)).text();
      const items = getAll(xml, "item").map(b => {
        const g = (t) => get1(b, t);
        const rawNum = g("applicationNumber");
        return {
          applicationNumber:   fmtAppNum(rawNum),
          applicationNumberRaw: rawNum,
          tradeMarkName:       g("title"),
          drawing:             g("drawing"),
          bigDrawing:          g("bigDrawing"),
          applicantName:       g("applicantName"),
          agentName:           g("agentName"),
          applicationDate:     fmtDate(g("applicationDate")),
          applicationStatus:   g("applicationStatus"),
          classificationCode:  g("classificationCode"),
          registrationNumber:  g("registrationNumber"),
          registrationDate:    fmtDate(g("registrationDate")),
        };
      });
      return res.status(200).json({
        resultCode: get1(xml, "resultCode"),
        items,
        totalCount: parseInt(get1(xml, "totalCount")) || items.length,
        pageNo: parseInt(get1(xml, "pageNo")) || (pageNo || 1),
        numOfRows: parseInt(get1(xml, "numOfRows")) || 30,
      });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ════════════════════════════════════════════
  // MODE: detail (서지 + 지정상품 병렬)
  // 정확한 엔드포인트:
  //   - getBibliographyDetailInfoSearch  (서지상세)
  //   - trademarkDesignationGoodstInfo   (지정상품)
  // ════════════════════════════════════════════
  if (mode === "detail") {
    if (!applicationNumber) return res.status(400).json({ error: "applicationNumber required" });
    const numClean = applicationNumber.replace(/\D/g, "");
    const base = "http://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService";

    // 정확한 KIPRIS Plus 오퍼레이션 이름들
    const endpoints = {
      bibliography: `${base}/getBibliographyDetailInfoSearch?applicationNumber=${numClean}&ServiceKey=${encodeURIComponent(ACCESS_KEY)}`,
      goods:        `${base}/trademarkDesignationGoodstInfo?applicationNumber=${numClean}&ServiceKey=${encodeURIComponent(ACCESS_KEY)}`,
    };

    const safeFetch = async (url) => {
      try {
        const r = await fetch(url);
        return await r.text();
      } catch { return ""; }
    };

    try {
      const [bibXml, goodsXml] = await Promise.all([
        safeFetch(endpoints.bibliography),
        safeFetch(endpoints.goods),
      ]);

      // ── 서지정보 파싱 ──
      // 응답 구조: <biblioSummaryInfo> / <applicantInfo> / <agentInfo> / <designatedGoodInfo> 등이 들어있는 형태
      let bibliography = null;
      let applicants = [];

      // 서지요약 블록
      for (const tag of ["biblioSummaryInfoArray", "biblioSummaryInfo", "item"]) {
        const blocks = getAll(bibXml, tag);
        if (blocks.length > 0) {
          const b = blocks[0];
          const g = (t) => get1(b, t);
          bibliography = {
            applicationNumber:   fmtAppNum(g("applicationNumber")),
            applicationDate:     fmtDate(g("applicationDate")),
            registrationNumber:  g("registrationNumber"),
            registrationDate:    fmtDate(g("registrationDate")),
            publicationNumber:   g("publicationNumber") || g("publicNumber"),
            publicationDate:     fmtDate(g("publicationDate") || g("publicDate")),
            registrationPublicNumber: g("registrationPublicNumber"),
            registrationPublicDate:   fmtDate(g("registrationPublicDate")),
            title:               g("title"),
            drawing:             g("drawing"),
            bigDrawing:          g("bigDrawing"),
            applicationStatus:   g("applicationStatus"),
            classificationCode:  g("classificationCode"),
            viennaCode:          g("viennaCode"),
            priorityNumber:      g("priorityNumber"),
            priorityDate:        fmtDate(g("priorityDate")),
            internationalRegisterNumber: g("internationalRegisterNumber"),
            internationalRegisterDate:   fmtDate(g("internationalRegisterDate")),
          };
          break;
        }
      }

      // 출원인 정보 파싱 (applicantInfo, agentInfo, RegistrationLastHolderInfo 등)
      const applicantBlocks = [
        ...getAll(bibXml, "applicantInfo").map(b => ({ block: b, role: "출원인" })),
        ...getAll(bibXml, "agentInfo").map(b => ({ block: b, role: "대리인" })),
        ...getAll(bibXml, "rightHoler").map(b => ({ block: b, role: "권리자" })),
        ...getAll(bibXml, "RegistrationLastHolderInfo").map(b => ({ block: b, role: "최종권리자" })),
      ];
      applicants = applicantBlocks.map(({ block, role }) => {
        const g = (t) => get1(block, t);
        return {
          name:    g("name") || g("applicantName") || g("agentName"),
          code:    g("code") || g("applicantCode") || g("agentCode") || g("customerNumber"),
          address: g("address") || g("applicantAddress") || g("agentAddress"),
          role,
        };
      }).filter(a => a.name);

      // ── 지정상품 파싱 ──
      // 응답 구조: <trademarkDesignationGoodstInfo> 또는 <item> 안에 designatedGoodInfo가 반복됨
      let designatedGoods = [];
      for (const tag of ["designatedGoodInfo", "designatedGoodsInfo", "item"]) {
        const blocks = getAll(goodsXml, tag);
        if (blocks.length > 0) {
          designatedGoods = blocks.map(b => {
            const g = (t) => get1(b, t);
            return {
              classificationCode: g("classificationCode") || g("goodsClassificationCode") || g("goodsClass"),
              goodName:           g("goodName") || g("classOfGoodService") || g("classOfGoodSerivice") || g("designatedGoodsName"),
              similarityCode:     g("similarityCode"),
            };
          }).filter(g => g.goodName);
          break;
        }
      }

      // 만약 지정상품이 비었다면 서지정보 XML에 들어있는 경우도 시도
      if (designatedGoods.length === 0) {
        for (const tag of ["designatedGoodInfo", "designatedGoodsInfo"]) {
          const blocks = getAll(bibXml, tag);
          if (blocks.length > 0) {
            designatedGoods = blocks.map(b => {
              const g = (t) => get1(b, t);
              return {
                classificationCode: g("classificationCode") || g("goodsClassificationCode") || g("goodsClass"),
                goodName:           g("goodName") || g("classOfGoodService") || g("classOfGoodSerivice") || g("designatedGoodsName"),
                similarityCode:     g("similarityCode"),
              };
            }).filter(g => g.goodName);
            if (designatedGoods.length > 0) break;
          }
        }
      }

      return res.status(200).json({
        bibliography,
        designatedGoods,
        applicants,
        debug: {
          bibLen: bibXml.length,
          goodsLen: goodsXml.length,
          bibSnippet: bibXml.slice(0, 500),
          goodsSnippet: goodsXml.slice(0, 500),
        },
      });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ════════════════════════════════════════════
  // MODE: rejection (거절결정서)
  // ════════════════════════════════════════════
  if (mode === "rejection") {
    const params = new URLSearchParams({
      accessKey: ACCESS_KEY, tradeMark: "true", patent: "false", utility: "false", design: "false",
      docsCount: "30", docsStart: String(pageNo || 1), descSort: "true",
    });
    if (applicationNumber) params.append("applicationNumber", applicationNumber.replace(/\D/g, ""));
    if (word)              params.append("word",              word);
    if (rejectionContent)  params.append("rejectionContent",  rejectionContent);
    if (sendDate)          params.append("sendDate",          sendDate);
    if (!applicationNumber && !word && !rejectionContent) {
      return res.status(400).json({ error: "applicationNumber/word/rejectionContent 중 하나 필요" });
    }
    const url = `http://plus.kipris.or.kr/openapi/rest/IntermediateDocumentREService/advancedSearchInfo?${params.toString()}`;
    try {
      const xml = await (await fetch(url)).text();
      const items = getAll(xml, "advancedSearchInfo").map(b => {
        const g = (t) => get1(b, t);
        return {
          applicationNumber: fmtAppNum(g("applicationNumber")),
          sendNumber:        g("sendNumber"),
          sendDate:          fmtDate(g("sendDate")),
          title:             g("title"),
          filePath:          g("filePath"),
        };
      });
      return res.status(200).json({ resultCode: get1(xml, "resultCode"), items });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ════════════════════════════════════════════
  // MODE: register (등록결정서)
  // ════════════════════════════════════════════
  if (mode === "register") {
    if (!applicationNumber) return res.status(400).json({ error: "applicationNumber required" });
    const numClean = applicationNumber.replace(/\D/g, "");
    const url = `http://plus.kipris.or.kr/openapi/rest/IntermediateDocumentRGService/bibliographicInfo?applicationNumber=${numClean}&accessKey=${encodeURIComponent(ACCESS_KEY)}`;
    try {
      const xml = await (await fetch(url)).text();
      const items = getAll(xml, "bibliographicInfo").map(b => {
        const g = (t) => get1(b, t);
        return {
          applicationNumber:  fmtAppNum(g("applicationNumber")),
          sendNumber:         g("sendNumber"),
          documentSendNumber: g("documentSendNumber"),
          sendDate:           fmtDate(g("sendDate")),
          documentSentence:   g("documentSentence"),
          documentName:       g("documentName"),
          documentDrawupDate: fmtDate(g("documentDrawupDate")),
          inventionName:      g("inventionName"),
          demandItemcount:    g("demandItemcount"),
        };
      });
      return res.status(200).json({ resultCode: get1(xml, "resultCode"), items });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  return res.status(400).json({ error: "mode must be one of: history, search, detail, rejection, register" });
}
