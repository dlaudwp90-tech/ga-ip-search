// pages/api/kipris.js  v11
// v11 변경: ⭐ getBibliographyDetailInfoSearch 단일 호출로 모든 상세정보 추출
//   - asignProductArray 의 (mainCode + productName + subCode) 로 지정상품-유사군 1:1 매칭
//   - administrativeMeasureInfoArray 행정처분 이력
//   - viennaCodeInfoArray 도형(비엔나) 코드
//   - vfersionInfoArray NICE 분류 버전
//   - sampleImageInfoArray 견본 이미지
//   - publicationInfoArray 공고 PDF
//   - partialRejectInfoArray 부분거절 상품
//   기존 tradeMarkClassificationInfo + trademarkSimilarityCodeInfo 호출 제거
//   Path: kipo-api/kipi/...?ServiceKey= (기존과 다름) — 백업으로 openapi/rest path 도 시도
// + commonSearch 모드 신규 (출원인/대리인/등록권자 검색)

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

  // ════════════════════════════════════════════
  // MODE: detail (v11 - 단일 API 호출로 모든 정보 추출)
  // 
  // ⭐ getBibliographyDetailInfoSearch 가 응답에 다음을 모두 포함:
  //   - biblioSummaryInfoArray         서지요약
  //   - applicantInfoArray             출원인 (코드/이름/주소)
  //   - agentInfoArray                 대리인 (코드/이름/주소)
  //   - asignProductArray              지정상품 (mainCode 류 + productName + subCode 유사군 — 1:1 매칭)
  //   - partialRejectInfoArray         부분거절 상품
  //   - administrativeMeasureInfoArray 행정처분 이력
  //   - viennaCodeInfoArray            도형(비엔나) 코드
  //   - vfersionInfoArray              NICE 분류 버전 + 류 분류명
  //   - sampleImageInfoArray           견본 이미지 경로
  //   - publicationInfoArray           공고 PDF 다운로드 경로
  //   - similarityCodeInfoArray        전체 유사군코드 (참고)
  //
  // Path: /kipo-api/kipi/...?ServiceKey=  (다른 API들의 /openapi/rest/...?accessKey= 와 다름)
  // 응답이 작거나 에러 시 /openapi/rest/.../accessKey 경로도 시도 (백업)
  // ════════════════════════════════════════════
  if (mode === "detail") {
    if (!applicationNumber) return res.status(400).json({ error: "applicationNumber required" });
    const numClean = applicationNumber.replace(/\D/g, "");
    const debug = !!req.body.debug;
    const ak = encodeURIComponent(ACCESS_KEY);

    const bibKipoUrl = `http://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService/getBibliographyDetailInfoSearch?applicationNumber=${numClean}&ServiceKey=${ak}`;
    const bibRestUrl = `http://plus.kipris.or.kr/openapi/rest/trademarkInfoSearchService/getBibliographyDetailInfoSearch?applicationNumber=${numClean}&accessKey=${ak}`;

    try {
      // 두 path를 동시에 시도. 더 큰(또는 정상) 응답을 사용
      const [xmlA, xmlB] = await Promise.all([
        fetch(bibKipoUrl).then(r => r.text()).catch(() => ""),
        fetch(bibRestUrl).then(r => r.text()).catch(() => ""),
      ]);
      const isError = (x) => !x || x.length < 200 || /Not Found|<resultCode>1\d<\/resultCode>|<successYN>N<\/successYN>/i.test(x);
      let bibXml = "", bibSource = "";
      if (!isError(xmlA) && xmlA.length >= xmlB.length) { bibXml = xmlA; bibSource = "kipo-api+ServiceKey"; }
      else if (!isError(xmlB))                          { bibXml = xmlB; bibSource = "openapi/rest+accessKey"; }
      else if (xmlA.length >= xmlB.length)              { bibXml = xmlA; bibSource = "kipo-api+ServiceKey(error)"; }
      else                                              { bibXml = xmlB; bibSource = "openapi/rest+accessKey(error)"; }

      // ── 서지요약 (biblioSummaryInfo) ──
      let bibliography = null;
      const bibBlocks = getAll(bibXml, "biblioSummaryInfo");
      if (bibBlocks.length > 0) {
        const b = bibBlocks[0];
        const g = (t) => get1(b, t);
        bibliography = {
          applicationNumber:           fmtAppNum(g("applicationNumber")),
          applicationDate:             fmtDate(g("applicationDate")),
          publicationNumber:           g("publicationNumber"),
          publicationDate:             fmtDate(g("publicationDate")),
          registerNumber:              g("registrationNumber") || g("registerNumber"),
          registerDate:                fmtDate(g("registrationDate") || g("registerDate")),
          registrationPublicNumber:    g("registrationPublicNumber"),
          registrationPublicDate:      fmtDate(g("registrationPublicDate")),
          priorityNumber:              g("priorityApplicationNumber") || g("priorityNumber"),
          priorityDate:                fmtDate(g("priorityApplicationDate") || g("priorityDate")),
          internationalRegisterNumber: g("internationalRegisterNumber"),
          internationalRegisterDate:   fmtDate(g("internationalRegisterDate")),
          tradeMarkName:               g("productName") || g("title") || g("trademarkName"),
          applicationStatus:           g("registerStatus") || g("applicationStatus"),
          tmDivisionCode:              g("tmDivisionCode"),
          trademarkDivisionCode:       g("trademarkDivisionCode"),
          lastDisposalCode:            g("lastDisposalCode"),
          lastDisposalDate:            fmtDate(g("lastDisposalDate")),
          classificationCode:          g("classificationCode"),
          viennaCode:                  g("viennaCode"),
          drawingPath:                 g("drawing") || g("bigDrawing"),
        };
      }

      // ── 인명정보: 출원인 (applicantInfo) + 대리인 (agentInfo) ──
      const applicants = [];
      for (const block of getAll(bibXml, "applicantInfo")) {
        const g = (t) => get1(block, t);
        const name = g("nameKoreanLong") || g("name") || g("applicantName");
        if (name) applicants.push({
          role: "출원인", name,
          code: g("applicantCode") || g("code"),
          address: g("applicantAddress") || g("address"),
          nationalCode: g("nationalCode"),
        });
      }
      for (const block of getAll(bibXml, "agentInfo")) {
        const g = (t) => get1(block, t);
        const name = g("nameKoreanLong") || g("name") || g("agentName");
        if (name) applicants.push({
          role: "대리인", name,
          code: g("agentCode") || g("code"),
          address: g("agentAddress") || g("address"),
          nationalCode: g("nationalCode"),
        });
      }

      // ── 지정상품 + 유사군 1:1 매칭 (asignProductArray) ──
      // mainCode=류, productName=상품명, productNameEng=영문명, seq=일련번호, subCode=유사군코드
      const designatedGoods = [];
      for (const block of getAll(bibXml, "asignProduct")) {
        const g = (t) => get1(block, t);
        const productName = g("productName");
        if (productName) designatedGoods.push({
          classificationCode:       g("mainCode") || "",
          goodName:                 productName,
          goodNameEng:              g("productNameEng"),
          classOfGoodSerialNumber:  parseInt(g("seq")) || 0,
          similarityCodes:          [g("subCode")].filter(Boolean),
        });
      }
      designatedGoods.sort((a, b) => {
        const c = (a.classificationCode || "").localeCompare(b.classificationCode || "");
        return c !== 0 ? c : a.classOfGoodSerialNumber - b.classOfGoodSerialNumber;
      });

      // ── 부분거절 상품 (partialRejectInfoArray) ──
      const partialRejectGoods = [];
      for (const block of getAll(bibXml, "partialRejectInfo")) {
        const g = (t) => get1(block, t);
        const productName = g("productName");
        if (productName) partialRejectGoods.push({
          classificationCode:       g("mainCode") || "",
          goodName:                 productName,
          goodNameEng:              g("productNameEng"),
          classOfGoodSerialNumber:  parseInt(g("seq")) || 0,
          similarityCodes:          [g("subCode")].filter(Boolean),
        });
      }

      // ── 행정처분 이력 (administrativeMeasureInfoArray) ──
      const adminMeasures = [];
      for (const block of getAll(bibXml, "administrativeMeasureInfo")) {
        const g = (t) => get1(block, t);
        adminMeasures.push({
          seq:        parseInt(g("seq")) || 0,
          date:       g("receiptSendDate"),
          state:      g("processStateCode"),
          docName:    g("receiptSendDocumentName"),
          docNameEng: g("receiptSendDocumentEngName"),
          docNumber:  g("receiptSendNumber"),
        });
      }
      adminMeasures.sort((a, b) => a.seq - b.seq);

      // ── 비엔나 도형 코드 (viennaCodeInfoArray) ──
      const viennaCodes = [];
      for (const block of getAll(bibXml, "viennaCodeInfo")) {
        const g = (t) => get1(block, t);
        if (g("viennaCode")) viennaCodes.push({
          code: g("viennaCode"),
          description: g("viennaCodeDescription"),
        });
      }

      // ── NICE 분류 버전 (vfersionInfoArray) ──
      const niceVersions = [];
      for (const block of getAll(bibXml, "vfersionInfo")) {
        const g = (t) => get1(block, t);
        if (g("cd") || g("ver")) niceVersions.push({
          code: g("cd"),
          version: g("ver"),
          koName: g("koNm"),
          enName: g("enNm"),
        });
      }

      // ── 견본 이미지 (sampleImageInfoArray) ──
      const sampleImages = [];
      for (const block of getAll(bibXml, "sampleImageInfo")) {
        const g = (t) => get1(block, t);
        const path = g("path") || g("smallPath");
        if (path) sampleImages.push({
          name: g("imageName"),
          path,
          smallPath: g("smallPath"),
        });
      }

      // ── 공고 PDF (publicationInfoArray) ──
      const publications = [];
      for (const block of getAll(bibXml, "publicationInfo")) {
        const g = (t) => get1(block, t);
        if (g("path")) publications.push({
          pdfName: g("pdfName"),
          path: g("path"),
        });
      }

      // ── 디버그 ──
      let _debug = null;
      if (debug) {
        _debug = {
          bibSource, bibKipoUrl, bibRestUrl,
          lengths: { kipo: xmlA.length, rest: xmlB.length, used: bibXml.length },
          resultCodes: {
            kipo: get1(xmlA, "resultCode") || get1(xmlA, "successYN"),
            rest: get1(xmlB, "resultCode") || get1(xmlB, "successYN"),
          },
          errorMsgs: {
            kipo: get1(xmlA, "resultMsg") || get1(xmlA, "errMessage"),
            rest: get1(xmlB, "resultMsg") || get1(xmlB, "errMessage"),
          },
          counts: {
            applicants: applicants.length,
            designatedGoods: designatedGoods.length,
            partialRejectGoods: partialRejectGoods.length,
            adminMeasures: adminMeasures.length,
            viennaCodes: viennaCodes.length,
            niceVersions: niceVersions.length,
            sampleImages: sampleImages.length,
            publications: publications.length,
          },
          bibSnippet: bibXml.slice(0, 1500),
        };
      }

      return res.status(200).json({
        bibliography, applicants, designatedGoods, partialRejectGoods,
        adminMeasures, viennaCodes, niceVersions, sampleImages, publications,
        _debug,
      });
    } catch (err) { return res.status(500).json({ error: err.message }); }
  }

  // ════════════════════════════════════════════
  // MODE: commonSearch (출원인/대리인/등록권자 검색)
  // type: "applicant" | "agent" | "registrant"
  // input: searchName 또는 searchAddress
  // ════════════════════════════════════════════
  if (mode === "commonSearch") {
    const { searchType, searchName, searchAddress, docsStart } = req.body;
    const opMap = {
      applicant:  "CommonSearchApplicantInfo",
      agent:      "CommonSearchAgentInfo",
      registrant: "CommonSearchRegisterInfo",
      inventor:   "CommonSearchInventorInfo",
    };
    const op = opMap[searchType] || "CommonSearchApplicantInfo";
    const ak = encodeURIComponent(ACCESS_KEY);
    const params = new URLSearchParams();
    if (searchName)    params.set("searchName", searchName);
    if (searchAddress) params.set("searchAddress", searchAddress);
    params.set("docsStart", String(docsStart || 1));
    params.set("accessKey", ACCESS_KEY);
    const url = `http://plus.kipris.or.kr/openapi/rest/CommonSearchService/${op}?${params.toString()}`;

    try {
      const xml = await fetch(url).then(r => r.text()).catch(() => "");
      const items = [];
      for (const block of getAll(xml, "commonSearchPersonInfo")) {
        const g = (t) => get1(block, t);
        items.push({
          index:       parseInt(g("IndexNumber")) || 0,
          personNumber: g("PersonNumber"),
          address:     g("Address"),
          name:        g("Name"),
          englishName: g("EnglishName") || g("EnglishlanguageName"),
        });
      }
      const totalCount = parseInt(get1(xml, "TotalSearchCount")) || items.length;
      return res.status(200).json({ items, totalCount, searchType });
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
