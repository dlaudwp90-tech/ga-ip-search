// pages/api/kipris.js  v5

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const ACCESS_KEY = process.env.KIPRIS_ACCESS_KEY;
  if (!ACCESS_KEY) return res.status(500).json({ error: "KIPRIS_ACCESS_KEY 미설정" });

  const {
    mode, applicationNumber,
    tradeMarkName, classificationCode, similarityCode, applicantName, agentName, extraQuery, pageNo,
    word, rejectionContent, sendDate,
    statusFilter,
  } = req.body;

  const getAll = (t, tag) => {
    const r = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "g");
    const out = []; let m;
    while ((m = r.exec(t)) !== null) out.push(m[1].trim());
    return out;
  };
  const get1 = (t, tag) => getAll(t, tag)[0] || "";
  const fmtDate = (d) => {
    if (!d) return "";
    const s = d.replace(/[^\d]/g, "");
    if (s.length === 8) return `${s.slice(0,4)}.${s.slice(4,6)}.${s.slice(6,8)}`;
    return d;
  };
  const fmtAppNum = (raw) => {
    const s = (raw || "").replace(/[^\d]/g, "");
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
  // MODE: search (KIPRIS 검색식으로 매핑)
  // 출원인 → AP=[이름], 대리인 → AG=[이름]
  // 여러 조건 결합: + (AND), * (OR)
  // ════════════════════════════════════════════
  if (mode === "search") {
    if (!tradeMarkName && !classificationCode && !similarityCode && !applicantName && !agentName && !extraQuery) {
      return res.status(400).json({ error: "검색 조건을 하나 이상 입력해주세요" });
    }

    // 검색식 빌드: 모든 조건을 + (AND)로 결합
    const queryParts = [];
    if (tradeMarkName) queryParts.push(tradeMarkName.trim());
    if (applicantName) queryParts.push(`AP=[${applicantName.trim()}]`);
    if (agentName)     queryParts.push(`AG=[${agentName.trim()}]`);
    if (extraQuery)    queryParts.push(extraQuery.trim()); // 좌측 패널 검색식 그대로 추가
    const finalQuery = queryParts.join("+");

    const params = new URLSearchParams({
      ServiceKey: ACCESS_KEY,
      searchRecentYear: "0",
      numOfRows: "30",
      pageNo: String(pageNo || 1),
    });
    if (finalQuery) params.append("searchString", finalQuery);
    if (classificationCode) params.append("classificationCode", classificationCode.replace(/[^0-9,]/g, ""));

    // 행정상태 필터 (출원/공고/등록 등)
    // KIPRIS 응답 후 클라이언트 필터링도 가능하지만 서버에서 처리 가능한 케이스만
    const url = `http://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService/getWordSearch?${params.toString()}`;

    try {
      const xml = await (await fetch(url)).text();
      let items = getAll(xml, "item").map(b => {
        const g = (t) => get1(b, t);
        const rawNum = g("applicationNumber");
        return {
          applicationNumber:    fmtAppNum(rawNum),
          applicationNumberRaw: rawNum,
          tradeMarkName:        g("title"),
          drawing:              g("drawing"),
          bigDrawing:           g("bigDrawing"),
          applicantName:        g("applicantName"),
          agentName:            g("agentName"),
          applicationDate:      fmtDate(g("applicationDate")),
          applicationStatus:    g("applicationStatus"),
          classificationCode:   g("classificationCode"),
          registrationNumber:   g("registrationNumber"),
          registrationDate:     fmtDate(g("registrationDate")),
          regPrivilegeName:     g("regPrivilegeName"),
        };
      });

      // 클라이언트측 행정상태 필터링
      if (statusFilter && Array.isArray(statusFilter) && statusFilter.length > 0) {
        items = items.filter(it => {
          const st = (it.applicationStatus || "");
          return statusFilter.some(f => st.includes(f));
        });
      }

      return res.status(200).json({
        resultCode: get1(xml, "resultCode"),
        items,
        totalCount: parseInt(get1(xml, "totalCount")) || items.length,
        pageNo: parseInt(get1(xml, "pageNo")) || (pageNo || 1),
        numOfRows: parseInt(get1(xml, "numOfRows")) || 30,
        finalQuery,
      });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ════════════════════════════════════════════
  // MODE: detail
  // 서지정보: getBibliographyDetailInfoSearch (정상)
  // 지정상품: trademarkDesignationGoodstInfo
  //          → 응답에 "INVALID_REQUEST_PARAMETER" 발생
  //          → 서지정보 응답 안에 designatedGoodInfo가 포함될 가능성 있음 → 거기서 추출
  // ════════════════════════════════════════════
  if (mode === "detail") {
    if (!applicationNumber) return res.status(400).json({ error: "applicationNumber required" });
    const numClean = applicationNumber.replace(/\D/g, "");
    const base = "http://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService";

    // 여러 후보를 시도
    const bibliographyUrl = `${base}/getBibliographyDetailInfoSearch?applicationNumber=${numClean}&accessKey=${encodeURIComponent(ACCESS_KEY)}`;
    // 지정상품: ServiceKey가 아닌 accessKey를 시도, 그리고 다른 오퍼레이션 이름들도 시도
    const goodsCandidates = [
      `${base}/trademarkDesignationGoodstInfo?applicationNumber=${numClean}&accessKey=${encodeURIComponent(ACCESS_KEY)}`,
      `${base}/trademarkDesignationGoodstInfo?applicationNumber=${numClean}&ServiceKey=${encodeURIComponent(ACCESS_KEY)}`,
      `${base}/designatedGoodsSearchInfo?applicationNumber=${numClean}&accessKey=${encodeURIComponent(ACCESS_KEY)}`,
    ];

    const safeFetch = async (url) => { try { return await (await fetch(url)).text(); } catch { return ""; } };

    try {
      const bibXml = await safeFetch(bibliographyUrl);

      // 지정상품 - 후보 URL 순차 시도, INVALID_REQUEST 아닌 첫 응답 사용
      let goodsXml = "";
      let goodsUsedUrl = "";
      for (const url of goodsCandidates) {
        const x = await safeFetch(url);
        if (x && !x.includes("INVALID_REQUEST_PARAMETER")) {
          goodsXml = x;
          goodsUsedUrl = url;
          break;
        }
        if (!goodsXml) { goodsXml = x; goodsUsedUrl = url; } // 마지막 응답이라도 보관
      }

      // 서지정보 파싱 — 응답 구조: <item> > <biblioSummaryInfoArray><biblioSummaryInfo>
      // 동시에 administrativeMeasureInfoArray, applicantInfoArray 등 다수 존재
      let bibliography = null;
      let applicants = [];

      // 1. 서지요약
      for (const tag of ["biblioSummaryInfo", "biblioSummaryInfoArray", "item"]) {
        const blocks = getAll(bibXml, tag);
        if (blocks.length > 0) {
          // 가장 안쪽 biblioSummaryInfo를 찾음
          const innerBlocks = getAll(blocks[0], "biblioSummaryInfo");
          const b = innerBlocks.length > 0 ? innerBlocks[0] : blocks[0];
          const g = (t) => get1(b, t);
          if (g("applicationNumber")) {
            bibliography = {
              applicationNumber:        fmtAppNum(g("applicationNumber")),
              applicationDate:          fmtDate(g("applicationDate")),
              registrationNumber:       g("registrationNumber"),
              registrationDate:         fmtDate(g("registrationDate")),
              publicationNumber:        g("publicationNumber") || g("publicNumber"),
              publicationDate:          fmtDate(g("publicationDate") || g("publicDate")),
              registrationPublicNumber: g("registrationPublicNumber"),
              registrationPublicDate:   fmtDate(g("registrationPublicDate")),
              title:                    g("title"),
              drawing:                  g("drawing"),
              bigDrawing:               g("bigDrawing"),
              applicationStatus:        g("applicationStatus"),
              classificationCode:       g("classificationCode"),
              viennaCode:               g("viennaCode"),
              priorityNumber:           g("priorityNumber"),
              priorityDate:             fmtDate(g("priorityDate")),
              internationalRegisterNumber: g("internationalRegisterNumber"),
              internationalRegisterDate:   fmtDate(g("internationalRegisterDate")),
            };
            break;
          }
        }
      }

      // 2. 출원인/대리인 - applicantInfoArray > applicantInfo, agentInfoArray > agentInfo
      const grabPersons = (xml, arrayTag, itemTag, role) => {
        const arrays = getAll(xml, arrayTag);
        const blocks = arrays.length > 0
          ? arrays.flatMap(a => getAll(a, itemTag))
          : getAll(xml, itemTag);
        return blocks.map(b => {
          const g = (t) => get1(b, t);
          return {
            name:    g("name") || g("applicantName") || g("agentName"),
            code:    g("code") || g("applicantCode") || g("agentCode") || g("customerNumber"),
            address: g("address") || g("applicantAddress") || g("agentAddress"),
            role,
          };
        }).filter(x => x.name);
      };
      applicants = [
        ...grabPersons(bibXml, "applicantInfoArray", "applicantInfo", "출원인"),
        ...grabPersons(bibXml, "agentInfoArray", "agentInfo", "대리인"),
        ...grabPersons(bibXml, "rightHolderInfoArray", "rightHolderInfo", "권리자"),
        ...grabPersons(bibXml, "RegistrationLastHolderInfoArray", "RegistrationLastHolderInfo", "최종권리자"),
      ];

      // 3. 지정상품 파싱 — 두 응답 모두에서 시도
      const grabGoods = (xml) => {
        for (const tag of ["designatedGoodInfo", "designatedGoodsInfo"]) {
          const blocks = getAll(xml, tag);
          if (blocks.length > 0) {
            return blocks.map(b => {
              const g = (t) => get1(b, t);
              return {
                classificationCode: g("classificationCode") || g("goodsClassificationCode") || g("goodsClass"),
                goodName:           g("goodName") || g("classOfGoodService") || g("classOfGoodSerivice") || g("designatedGoodsName"),
                similarityCode:     g("similarityCode"),
              };
            }).filter(g => g.goodName);
          }
        }
        return [];
      };
      let designatedGoods = grabGoods(bibXml);
      if (designatedGoods.length === 0) {
        designatedGoods = grabGoods(goodsXml);
      }

      return res.status(200).json({
        bibliography,
        designatedGoods,
        applicants,
        debug: {
          bibLen: bibXml.length,
          goodsLen: goodsXml.length,
          goodsUsedUrl,
          bibSnippet: bibXml.slice(0, 800),
          goodsSnippet: goodsXml.slice(0, 500),
        },
      });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ════════════════════════════════════════════
  // MODE: rejection
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
  // MODE: register
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
