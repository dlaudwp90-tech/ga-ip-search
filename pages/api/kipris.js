// pages/api/kipris.js  v10
// v10 변경: ✅ 정확한 endpoint 확정 — /openapi/rest/trademarkInfoSearchService/trademarkSimilarityCodeInfo
//           wrapper: <trademarkSimilarityCodeInfo>, 필드: <SimilargroupCode>
//           ⚠️ 응답은 출원 단위 평면 리스트 (상품별 매핑 정보 없음)
//           → 류별(classification code)로 G/S 코드를 자동 분류하여 매칭
//           debug 정보는 단순화
// v9~v7: endpoint 후보 탐색 + 디버그 모드 (히스토리)

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

    const queryParts = [];
    if (tradeMarkName)      queryParts.push(tradeMarkName.trim());
    if (applicantName)      queryParts.push(`AP=[${applicantName.trim()}]`);
    if (agentName)          queryParts.push(`AG=[${agentName.trim()}]`);
    if (classificationCode) {
      const codes = classificationCode.replace(/[^0-9,]/g, "").split(",").filter(Boolean);
      if (codes.length === 1) {
        queryParts.push(`CL=[${codes[0].padStart(2, "0")}]`);
      } else if (codes.length > 1) {
        queryParts.push("(" + codes.map(c => `CL=[${c.padStart(2, "0")}]`).join("+") + ")");
      }
    }
    if (similarityCode) {
      const codes = similarityCode.trim().toUpperCase().split(",").map(s => s.trim()).filter(Boolean);
      if (codes.length === 1) {
        queryParts.push(`SC=[${codes[0]}]`);
      } else if (codes.length > 1) {
        queryParts.push("(" + codes.map(c => `SC=[${c}]`).join("+") + ")");
      }
    }
    if (extraQuery) queryParts.push(extraQuery.trim());
    const finalQuery = queryParts.join("*");

    const params = new URLSearchParams({
      ServiceKey: ACCESS_KEY,
      searchRecentYear: "0",
      numOfRows: "30",
      pageNo: String(pageNo || 1),
    });
    if (finalQuery) params.append("searchString", finalQuery);

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
  // ─ 서지정보:    /openapi/rest/trademarkInfoSearchService/getBibliographyDetailInfoSearch
  // ─ 지정상품:    /openapi/rest/TradeMarkClassificationInfoService/tradeMarkClassificationInfo
  // ─ 유사군코드:  /openapi/rest/trademarkInfoSearchService/trademarkSimilarityCodeInfo
  //               응답: <trademarkSimilarityCodeInfo><SimilargroupCode>G1004</SimilargroupCode>...
  //               ⚠️ 출원 단위 평면 리스트 — 상품 단위 매핑 정보 없음
  //               → 류별로 G(1~34류)/S(35~45류) 코드를 자동 분배하여 매칭
  // ════════════════════════════════════════════
  if (mode === "detail") {
    if (!applicationNumber) return res.status(400).json({ error: "applicationNumber required" });
    const numClean = applicationNumber.replace(/\D/g, "");
    const debug = !!req.body.debug;

    const ak = encodeURIComponent(ACCESS_KEY);
    const baseInfo  = "http://plus.kipris.or.kr/openapi/rest/trademarkInfoSearchService";
    const baseClass = "http://plus.kipris.or.kr/openapi/rest/TradeMarkClassificationInfoService";
    const bibliographyUrl = `${baseInfo}/getBibliographyDetailInfoSearch?applicationNumber=${numClean}&accessKey=${ak}`;
    const goodsUrl  = `${baseClass}/tradeMarkClassificationInfo?identificationNumber=${numClean}&docsStart=1&docsCount=500&accessKey=${ak}`;
    const simUrl    = `${baseInfo}/trademarkSimilarityCodeInfo?applicationNumber=${numClean}&accessKey=${ak}`;

    try {
      const [bibXml, goodsXml, simXml] = await Promise.all([
        fetch(bibliographyUrl).then(r => r.text()).catch(() => ""),
        fetch(goodsUrl).then(r => r.text()).catch(() => ""),
        fetch(simUrl).then(r => r.text()).catch(() => ""),
      ]);

      // ── 서지정보 파싱 ──
      let bibliography = null;
      let applicants = [];

      for (const tag of ["biblioSummaryInfo", "biblioSummaryInfoArray", "item"]) {
        const blocks = getAll(bibXml, tag);
        if (blocks.length > 0) {
          const innerBlocks = getAll(blocks[0], "biblioSummaryInfo");
          const b = innerBlocks.length > 0 ? innerBlocks[0] : blocks[0];
          const g = (t) => get1(b, t);
          if (g("applicationNumber")) {
            bibliography = {
              applicationNumber:        fmtAppNum(g("applicationNumber")),
              applicationDate:          fmtDate(g("applicationDate")),
              registerNumber:           g("registerNumber"),
              registerDate:             fmtDate(g("registerDate")),
              publicationNumber:        g("publicationNumber"),
              publicationDate:          fmtDate(g("publicationDate")),
              registrationPublicNumber: g("registrationPublicNumber"),
              registrationPublicDate:   fmtDate(g("registrationPublicDate")),
              priorityNumber:           g("priorityNumber"),
              priorityDate:             fmtDate(g("priorityDate")),
              internationalRegisterNumber: g("internationalRegisterNumber"),
              internationalRegisterDate:   fmtDate(g("internationalRegisterDate")),
              tradeMarkName:           g("title") || g("trademarkName") || g("tradeMarkName"),
              applicationStatus:       g("applicationStatus"),
              regPrivilegeName:        g("regPrivilegeName"),
              classificationCode:      g("classificationCode"),
              viennaCode:              g("viennaCode"),
              drawingPath:             g("drawing") || g("bigDrawing"),
            };
            break;
          }
        }
      }

      // 인명정보 (출원인/대리인/등록권자)
      const personRoles = [
        { tag: "applicantInfo",       role: "출원인" },
        { tag: "agentInfo",           role: "대리인" },
        { tag: "regPrivilegeNameInfo",role: "등록권자" },
        { tag: "lastApplicantInfo",   role: "최종권리자" },
      ];
      for (const { tag, role } of personRoles) {
        for (const block of getAll(bibXml, tag)) {
          const g = (t) => get1(block, t);
          const name = g("name") || g("applicantName") || g("agentName") || g("regPrivilegeName");
          if (name) {
            applicants.push({
              role,
              name,
              code:    g("code") || g("applicantCode") || g("agentCode") || g("regPrivilegeCode"),
              address: g("address") || g("applicantAddress"),
            });
          }
        }
      }

      // ── 지정상품 파싱 ──
      let designatedGoods = [];
      const goodsBlocks = getAll(goodsXml, "tradeMarkClassificationInfo");

      if (goodsBlocks.length > 0) {
        const allGoods = goodsBlocks.map(b => {
          const g = (t) => get1(b, t);
          return {
            status:                  g("status"),
            serialNumber:            parseInt(g("serialNumber")) || 0,
            classOfGoodSerialNumber: parseInt(g("classOfGoodSerialNumber")) || 0,
            classificationVersion:   g("classificationVersion"),
            goodsClassificationCode: g("goodsClassificationCode"),
            goodName: g("classofgoodServiceName") || g("classOfGoodServiceName") || g("classofgoodSerivceName"),
          };
        }).filter(x => x.goodName);

        if (allGoods.length > 0) {
          // (1) 등록 > 출원 우선
          const hasReg = allGoods.some(x => x.status === "등록");
          let pool = allGoods.filter(x => x.status === (hasReg ? "등록" : "출원"));
          if (pool.length === 0) pool = allGoods;

          // (2) 같은 status 안에서 가장 큰 serialNumber만
          const maxSerial = pool.reduce((m, x) => Math.max(m, x.serialNumber), 0);
          pool = pool.filter(x => x.serialNumber === maxSerial);

          // (3) NICE 분류 우선 (한국분류 'E' 제외)
          const numericVers = pool
            .map(x => parseInt(x.classificationVersion))
            .filter(v => Number.isFinite(v));
          if (numericVers.length > 0) {
            const maxV = String(Math.max(...numericVers));
            const filteredV = pool.filter(x => x.classificationVersion === maxV);
            if (filteredV.length > 0) pool = filteredV;
          }

          pool.sort((a, b) => a.classOfGoodSerialNumber - b.classOfGoodSerialNumber);

          designatedGoods = pool.map(x => ({
            classificationCode:      x.goodsClassificationCode || "",
            goodName:                x.goodName,
            classOfGoodSerialNumber: x.classOfGoodSerialNumber,
          }));
        }
      }

      // ── 유사군코드 파싱 (출원 단위 평면 리스트) ──
      // wrapper: <trademarkSimilarityCodeInfo>, 필드: <SimilargroupCode>
      // 응답이 출원 단위라 상품별 매핑 정보 없음 → 류별로 분배
      const simBlocks = getAll(simXml, "trademarkSimilarityCodeInfo");
      const allSimCodes = simBlocks
        .map(b => (get1(b, "SimilargroupCode") || get1(b, "similargroupCode") || get1(b, "similarGroupCode") || "").trim())
        .filter(Boolean);

      // 류별 그룹핑: 35류 이상은 S(서비스) 코드만, 1~34류는 G(상품) 코드만 매칭
      // 한 출원에 상품류와 서비스류가 섞여 있어도 자동 구분됨
      const classToSims = {};   // { "35": ["S2001", "S2002"], "9": ["G3902"], ... }
      designatedGoods.forEach(g => {
        const cls = parseInt(g.classificationCode);
        if (!Number.isFinite(cls) || classToSims[g.classificationCode]) return;
        const isService = cls >= 35;
        const codes = allSimCodes.filter(c => isService ? c.startsWith("S") : c.startsWith("G"));
        classToSims[g.classificationCode] = codes;
      });

      // 각 상품에 그 류에 해당하는 유사군코드 부여
      designatedGoods = designatedGoods.map(g => ({
        ...g,
        similarityCodes: classToSims[g.classificationCode] || [],
      }));

      // ── 디버그 정보 (간소화) ──
      let _debug = null;
      if (debug) {
        _debug = {
          bibliographyUrl, goodsUrl, simUrl,
          lengths: { bib: bibXml.length, goods: goodsXml.length, sim: simXml.length },
          resultCodes: {
            bib:   get1(bibXml, "resultCode") || get1(bibXml, "successYN"),
            goods: get1(goodsXml, "resultCode") || get1(goodsXml, "successYN"),
            sim:   get1(simXml, "resultCode") || get1(simXml, "successYN"),
          },
          errorMsgs: {
            bib:   get1(bibXml, "resultMsg") || get1(bibXml, "errMessage"),
            goods: get1(goodsXml, "resultMsg") || get1(goodsXml, "errMessage"),
            sim:   get1(simXml, "resultMsg") || get1(simXml, "errMessage"),
          },
          goodsBlockCount: goodsBlocks.length,
          designatedGoodsCount: designatedGoods.length,
          simBlockCount: simBlocks.length,
          allSimCodes,
          classToSims,
          simRawSample: simXml.slice(0, 1000),
        };
      }

      return res.status(200).json({ bibliography, designatedGoods, applicants, _debug });
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
