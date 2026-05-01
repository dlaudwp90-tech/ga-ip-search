// pages/api/kipris.js  v8
// v8 변경: ① 유사군코드 후보 endpoint 2개 시도 (trademarkSimilarityCodeInfo + trademarkAsignProductSearchInfo)
//          ② wrapper/필드명을 폭넓게 시도 (응답 구조가 문서와 다를 수 있음)
//          ③ tradeMarkClassificationInfo 응답에서도 유사군코드 추출 시도 (한 응답에 함께 있을 수도)
//          ④ detail 응답에 _debug 필드 포함 (실제 endpoint 응답 진단용)
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
  // 지정상품: TradeMarkClassificationInfoService/tradeMarkClassificationInfo (별도 API)
  // 유사군코드 후보 1: trademarkInfoSearchService/trademarkSimilarityCodeInfo (서지정보)
  // 유사군코드 후보 2: TradeMarkClassificationInfoService/trademarkAsignProductSearchInfo (부가기능)
  //   → 두 endpoint 모두 응답 구조가 문서로 명확히 알 수 없어 둘 다 시도
  //   → tradeMarkClassificationInfo 응답에도 유사군코드가 함께 있을 가능성 → 그것도 추출 시도
  // ════════════════════════════════════════════
  if (mode === "detail") {
    if (!applicationNumber) return res.status(400).json({ error: "applicationNumber required" });
    const numClean = applicationNumber.replace(/\D/g, "");
    const debug = !!req.body.debug;

    const base = "http://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService";
    const baseClass = "http://plus.kipris.or.kr/openapi/rest/TradeMarkClassificationInfoService";
    const bibliographyUrl = `${base}/getBibliographyDetailInfoSearch?applicationNumber=${numClean}&accessKey=${encodeURIComponent(ACCESS_KEY)}`;
    const goodsUrl  = `${baseClass}/tradeMarkClassificationInfo?identificationNumber=${numClean}&docsStart=1&docsCount=500&accessKey=${encodeURIComponent(ACCESS_KEY)}`;
    const simUrl1   = `${base}/trademarkSimilarityCodeInfo?applicationNumber=${numClean}&accessKey=${encodeURIComponent(ACCESS_KEY)}`;
    const simUrl2   = `${baseClass}/trademarkAsignProductSearchInfo?identificationNumber=${numClean}&docsStart=1&docsCount=500&accessKey=${encodeURIComponent(ACCESS_KEY)}`;

    try {
      // 네 API 병렬 호출 (보조 API 실패해도 서지정보는 보여주도록 catch)
      const [bibXml, goodsXml, simXml1, simXml2] = await Promise.all([
        fetch(bibliographyUrl).then(r => r.text()).catch(() => ""),
        fetch(goodsUrl).then(r => r.text()).catch(() => ""),
        fetch(simUrl1).then(r => r.text()).catch(() => ""),
        fetch(simUrl2).then(r => r.text()).catch(() => ""),
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

      // ── 지정상품 파싱 (TradeMarkClassificationInfoService) ──
      // 응답 구조: <items><tradeMarkClassificationInfo>...</tradeMarkClassificationInfo>...</items>
      // 같은 출원에 대해 출원시/등록시/갱신시 데이터가 누적되어 있음
      // → 가장 최신 데이터만 필터링: (1)등록>출원  (2)최대 serialNumber  (3)최신 NICE 버전
      let designatedGoods = [];
      const goodsBlocks = getAll(goodsXml, "tradeMarkClassificationInfo");

      // ── 유사군코드 파싱 ──
      // 두 후보 endpoint를 모두 시도. wrapper tag명이 문서로 명확하지 않아 폭넓게 시도
      // 또한 tradeMarkClassificationInfo 응답에도 유사군코드 필드가 함께 있을 가능성 있음
      const SIM_WRAPPER_TAGS = [
        "trademarkSimilarityCodeInfo",
        "similarityCodeInfo",
        "trademarkAsignProductSearchInfo",
        "asignProductInfo",
        "asignProductSearchInfo",
        "biblioSummaryInfo",
      ];
      const SIM_FIELD_NAMES = ["similarityCode", "similarGroupCode", "similarCode", "asignProductMainCode", "similarityCodes"];
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
      // 후보 1, 2, 그리고 goodsXml 자체에도 유사군 필드가 있을 가능성 → 셋 다 모음
      const allSimsRaw = [
        ...collectSimBlocks(simXml1),
        ...collectSimBlocks(simXml2),
        // tradeMarkClassificationInfo 블록에서도 유사군 필드 있는지 시도
        ...goodsBlocks,
      ].map(normalizeSimBlock).filter(x => x.codes.length > 0);

      if (goodsBlocks.length > 0) {
        const allGoods = goodsBlocks.map(b => {
          const g = (t) => get1(b, t);
          return {
            status:                  g("status"),
            serialNumber:            parseInt(g("serialNumber")) || 0,
            classOfGoodSerialNumber: parseInt(g("classOfGoodSerialNumber")) || 0,
            classificationVersion:   g("classificationVersion"),
            goodsClassificationCode: g("goodsClassificationCode"),
            // API 문서상 표기는 classofgoodServiceName / classOfGoodServiceName,
            // 일부 응답에는 오타(classofgoodSerivceName)도 존재 → 모두 대응
            goodName: g("classofgoodServiceName") || g("classOfGoodServiceName") || g("classofgoodSerivceName"),
            additionDeletionCode:    g("additionDeletionCode"),
          };
        }).filter(x => x.goodName);

        if (allGoods.length > 0) {
          // (1) 상태 우선순위: 등록 > 출원 (등록 데이터가 하나라도 있으면 등록만 사용)
          const hasReg = allGoods.some(x => x.status === "등록");
          let pool = allGoods.filter(x => x.status === (hasReg ? "등록" : "출원"));
          if (pool.length === 0) pool = allGoods;

          // (2) 같은 status 안에서 가장 큰 serialNumber만 (최신 갱신본)
          const maxSerial = pool.reduce((m, x) => Math.max(m, x.serialNumber), 0);
          pool = pool.filter(x => x.serialNumber === maxSerial);

          // (3) 분류 버전이 숫자(NICE)인 것이 있으면 가장 큰 NICE 버전 우선
          //     (옛 한국분류 'E'와 NICE 분류가 섞여 있을 때 NICE 우선)
          const numericVers = pool
            .map(x => parseInt(x.classificationVersion))
            .filter(v => Number.isFinite(v));
          if (numericVers.length > 0) {
            const maxV = String(Math.max(...numericVers));
            const filteredV = pool.filter(x => x.classificationVersion === maxV);
            if (filteredV.length > 0) pool = filteredV;
          }

          // (4) 지정상품 일련번호 순 정렬
          pool.sort((a, b) => a.classOfGoodSerialNumber - b.classOfGoodSerialNumber);

          // ── 유사군코드 매칭 ──
          // 1차: 정확히 같은 (status, version, classCode, classOfGoodSerial) 매칭
          // 2차: status 무시하고 (version, classCode, classOfGoodSerial) 매칭
          // 3차: version 도 무시하고 (classCode, classOfGoodSerial) 매칭
          // 4차: classOfGoodSerial 만으로 매칭 (분류코드도 무시)
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
      // 어떤 endpoint가 어떤 응답을 줬는지, 어떤 wrapper/필드가 발견됐는지 진단용
      // debug:true 일 때만 응답에 포함
      let _debug = null;
      if (debug) {
        // 첫 번째 sim 블록의 모든 자식 태그명 추출 (디버그용)
        const sniffTags = (xml, wrapperTag) => {
          const blocks = getAll(xml, wrapperTag);
          if (blocks.length === 0) return null;
          const tags = [...new Set([...(blocks[0].matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g))].map(m => m[1]))];
          return { wrapperTag, count: blocks.length, fields: tags, firstBlockSample: blocks[0].slice(0, 500) };
        };
        const sniffAny = (xml) => {
          for (const tag of SIM_WRAPPER_TAGS) {
            const r = sniffTags(xml, tag);
            if (r) return r;
          }
          // 그래도 못 찾으면 첫 200자만 노출
          return { wrapperTag: null, count: 0, fields: [], firstBlockSample: (xml || "").slice(0, 500) };
        };
        const goodsBlockSample = goodsBlocks[0] || "";
        const goodsTags = goodsBlockSample
          ? [...new Set([...(goodsBlockSample.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g))].map(m => m[1]))]
          : [];

        _debug = {
          urls: { bibliographyUrl, goodsUrl, simUrl1, simUrl2 },
          lengths: {
            bibXml: bibXml.length, goodsXml: goodsXml.length,
            simXml1: simXml1.length, simXml2: simXml2.length,
          },
          resultCodes: {
            bib:    get1(bibXml, "resultCode") || get1(bibXml, "successYN"),
            goods:  get1(goodsXml, "resultCode") || get1(goodsXml, "successYN"),
            sim1:   get1(simXml1, "resultCode") || get1(simXml1, "successYN"),
            sim2:   get1(simXml2, "resultCode") || get1(simXml2, "successYN"),
          },
          errorMsgs: {
            bib:    get1(bibXml, "errMessage") || get1(bibXml, "msg") || get1(bibXml, "message"),
            goods:  get1(goodsXml, "errMessage") || get1(goodsXml, "msg") || get1(goodsXml, "message"),
            sim1:   get1(simXml1, "errMessage") || get1(simXml1, "msg") || get1(simXml1, "message"),
            sim2:   get1(simXml2, "errMessage") || get1(simXml2, "msg") || get1(simXml2, "message"),
          },
          goodsBlockCount: goodsBlocks.length,
          goodsFieldsFound: goodsTags,
          goodsFirstBlockSample: goodsBlockSample.slice(0, 500),
          sim1Sniff: sniffAny(simXml1),
          sim2Sniff: sniffAny(simXml2),
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
