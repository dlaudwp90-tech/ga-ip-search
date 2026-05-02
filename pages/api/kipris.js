// pages/api/kipris.js  v9
// v9 변경: 유사군코드 endpoint 후보를 4개로 확장 (path × param 조합)
//          ① /kipo-api/kipi/trademarkInfoSearchService/ + applicationNumber
//          ② /openapi/rest/TradeMarkInfoSearchService/ + applicationNumber
//          ③ /openapi/rest/TradeMarkInfoSearchService/ + identificationNumber
//          ④ /openapi/rest/TradeMarkClassificationInfoService/ + identificationNumber
//          → 어느 한 곳에서라도 wrapper tag/필드를 찾으면 그걸 사용 (winner 표시)
// v8 변경: 유사군 후보 endpoint 2개 + wrapper/필드명 폭넓게 시도 + _debug 추가
// v7 변경: detail 모드에 trademarkSimilarityCodeInfo 호출 추가
// v6 변경: detail 모드에 TradeMarkClassificationInfoService 별도 호출 추가하여 지정상품 정상 표시

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
  // 서지정보: getBibliographyDetailInfoSearch
  // 지정상품: TradeMarkClassificationInfoService/tradeMarkClassificationInfo
  // 유사군코드: 4개 후보 endpoint를 병렬 시도 (path × param 조합)
  //   각 후보의 wrapper tag/필드명을 sniff 해서 가장 응답이 잘 나오는 걸 사용
  // ════════════════════════════════════════════
  if (mode === "detail") {
    if (!applicationNumber) return res.status(400).json({ error: "applicationNumber required" });
    const numClean = applicationNumber.replace(/\D/g, "");
    const debug = !!req.body.debug;

    const ak = encodeURIComponent(ACCESS_KEY);
    const base = "http://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService";
    const baseClass = "http://plus.kipris.or.kr/openapi/rest/TradeMarkClassificationInfoService";
    const baseInfo  = "http://plus.kipris.or.kr/openapi/rest/TradeMarkInfoSearchService";
    const bibliographyUrl = `${base}/getBibliographyDetailInfoSearch?applicationNumber=${numClean}&accessKey=${ak}`;
    const goodsUrl  = `${baseClass}/tradeMarkClassificationInfo?identificationNumber=${numClean}&docsStart=1&docsCount=500&accessKey=${ak}`;

    // 유사군코드 후보 endpoint 4개 (path × param 조합 모두 시도)
    const simCandidates = [
      { name: "kipo-api/TMSearch/trademarkSimilarityCodeInfo?applicationNumber",
        url:  `${base}/trademarkSimilarityCodeInfo?applicationNumber=${numClean}&accessKey=${ak}` },
      { name: "openapi/TMSearch/trademarkSimilarityCodeInfo?applicationNumber",
        url:  `${baseInfo}/trademarkSimilarityCodeInfo?applicationNumber=${numClean}&docsStart=1&docsCount=500&accessKey=${ak}` },
      { name: "openapi/TMSearch/trademarkSimilarityCodeInfo?identificationNumber",
        url:  `${baseInfo}/trademarkSimilarityCodeInfo?identificationNumber=${numClean}&docsStart=1&docsCount=500&accessKey=${ak}` },
      { name: "openapi/TMClass/trademarkSimilarityCodeInfo?identificationNumber",
        url:  `${baseClass}/trademarkSimilarityCodeInfo?identificationNumber=${numClean}&docsStart=1&docsCount=500&accessKey=${ak}` },
    ];

    try {
      // 모든 API 병렬 호출
      const [bibXml, goodsXml, ...simXmls] = await Promise.all([
        fetch(bibliographyUrl).then(r => r.text()).catch(() => ""),
        fetch(goodsUrl).then(r => r.text()).catch(() => ""),
        ...simCandidates.map(c => fetch(c.url).then(r => r.text()).catch(() => "")),
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

      // 출원인/대리인 등
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

      // ── 유사군코드 파싱 ──
      // 4개 후보 endpoint 응답을 모두 검사. 어느 하나라도 wrapper tag가 발견되면 그걸 사용
      const SIM_WRAPPER_TAGS = [
        "trademarkSimilarityCodeInfo",
        "similarityCodeInfo",
        "biblioSummaryInfo",
        "item",
      ];
      const SIM_FIELD_NAMES = ["similarityCode", "similarGroupCode", "similarCode", "similarityCodes"];
      const collectSimBlocks = (xml) => {
        const out = [];
        for (const tag of SIM_WRAPPER_TAGS) {
          const blks = getAll(xml, tag);
          if (blks.length > 0) out.push(...blks);
        }
        return out;
      };
      const normalizeSimBlock = (b) => {
        const g = (t) => get1(b, t);
        let sim = "";
        for (const f of SIM_FIELD_NAMES) {
          const v = g(f);
          if (v) { sim = v; break; }
        }
        return {
          status:                  g("status"),
          serialNumber:            parseInt(g("serialNumber")) || 0,
          classOfGoodSerialNumber: parseInt(g("classOfGoodSerialNumber")) || 0,
          classificationVersion:   g("classificationVersion"),
          goodsClassificationCode: (g("goodsClassificationCode") || g("classificationCode") || "").trim(),
          codes: (sim || "").split(/[,\s]+/).map(s => s.trim()).filter(Boolean),
        };
      };

      // 각 후보별로 sim 블록 수집 + winner 식별
      let simWinnerIdx = -1;
      const allSimsRaw = [];
      for (let i = 0; i < simXmls.length; i++) {
        const blks = collectSimBlocks(simXmls[i]);
        if (blks.length > 0) {
          if (simWinnerIdx < 0) simWinnerIdx = i;
          const normalized = blks.map(normalizeSimBlock).filter(x => x.codes.length > 0);
          allSimsRaw.push(...normalized);
        }
      }

      // ── 지정상품 파싱 (TradeMarkClassificationInfoService) ──
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
            additionDeletionCode:    g("additionDeletionCode"),
          };
        }).filter(x => x.goodName);

        if (allGoods.length > 0) {
          const hasReg = allGoods.some(x => x.status === "등록");
          let pool = allGoods.filter(x => x.status === (hasReg ? "등록" : "출원"));
          if (pool.length === 0) pool = allGoods;

          const maxSerial = pool.reduce((m, x) => Math.max(m, x.serialNumber), 0);
          pool = pool.filter(x => x.serialNumber === maxSerial);

          const numericVers = pool
            .map(x => parseInt(x.classificationVersion))
            .filter(v => Number.isFinite(v));
          if (numericVers.length > 0) {
            const maxV = String(Math.max(...numericVers));
            const filteredV = pool.filter(x => x.classificationVersion === maxV);
            if (filteredV.length > 0) pool = filteredV;
          }

          pool.sort((a, b) => a.classOfGoodSerialNumber - b.classOfGoodSerialNumber);

          // 4단계 폴백 매칭
          const matchSims = (good) => {
            const found = new Set();
            const collect = (filterFn) => {
              allSimsRaw.filter(filterFn).forEach(s => s.codes.forEach(c => found.add(c)));
            };
            const ver = good.classificationVersion;
            const cls = (good.goodsClassificationCode || "").trim();
            const ser = good.classOfGoodSerialNumber;
            collect(s =>
              s.status === good.status &&
              s.classificationVersion === ver &&
              s.goodsClassificationCode === cls &&
              s.classOfGoodSerialNumber === ser
            );
            if (found.size === 0) collect(s =>
              s.classificationVersion === ver &&
              s.goodsClassificationCode === cls &&
              s.classOfGoodSerialNumber === ser
            );
            if (found.size === 0) collect(s =>
              s.goodsClassificationCode === cls &&
              s.classOfGoodSerialNumber === ser
            );
            if (found.size === 0 && ser > 0) collect(s =>
              s.classOfGoodSerialNumber === ser
            );
            return [...found];
          };

          designatedGoods = pool.map(x => ({
            classificationCode:      x.goodsClassificationCode || "",
            goodName:                x.goodName,
            classOfGoodSerialNumber: x.classOfGoodSerialNumber,
            similarityCodes:         matchSims(x),
          }));
        }
      }

      // ── 디버그 정보 ──
      let _debug = null;
      if (debug) {
        const sniffAny = (xml) => {
          for (const tag of SIM_WRAPPER_TAGS) {
            const blks = getAll(xml, tag);
            if (blks.length > 0) {
              const tags = [...new Set([...(blks[0].matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g))].map(m => m[1]))];
              return { wrapperTag: tag, count: blks.length, fields: tags, firstBlockSample: blks[0].slice(0, 500) };
            }
          }
          return { wrapperTag: null, count: 0, fields: [], firstBlockSample: (xml || "").slice(0, 500) };
        };
        const goodsBlockSample = goodsBlocks[0] || "";
        const goodsTags = goodsBlockSample
          ? [...new Set([...(goodsBlockSample.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g))].map(m => m[1]))]
          : [];

        _debug = {
          bibliographyUrl, goodsUrl,
          simCandidates: simCandidates.map((c, i) => ({
            name: c.name,
            url: c.url,
            length: simXmls[i].length,
            resultCode: get1(simXmls[i], "resultCode") || get1(simXmls[i], "successYN"),
            errorMsg: get1(simXmls[i], "resultMsg") || get1(simXmls[i], "errMessage") || get1(simXmls[i], "msg"),
            sniff: sniffAny(simXmls[i]),
          })),
          simWinnerIdx,
          simWinnerName: simWinnerIdx >= 0 ? simCandidates[simWinnerIdx].name : null,
          bibLength: bibXml.length,
          bibResultCode: get1(bibXml, "resultCode") || get1(bibXml, "successYN"),
          bibErrorMsg: get1(bibXml, "resultMsg") || get1(bibXml, "errMessage"),
          goodsLength: goodsXml.length,
          goodsBlockCount: goodsBlocks.length,
          goodsFieldsFound: goodsTags,
          goodsFirstBlockSample: goodsBlockSample.slice(0, 500),
          allSimsCount: allSimsRaw.length,
          designatedGoodsCount: designatedGoods.length,
          goodsWithSimCount: designatedGoods.filter(g => g.similarityCodes.length > 0).length,
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
