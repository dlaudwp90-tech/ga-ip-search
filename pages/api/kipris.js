// pages/api/kipris.js  — 완전판
//
// mode: "history"    — 출원번호 행정처리이력 (상표 40- / 디자인 30- 자동 분기)
// mode: "search"     — 상표명 검색 (trademarkInfoSearchService/getWordSearch)
// mode: "rejection"  — 거절결정서 검색 (IntermediateDocumentREService)
// mode: "register"   — 등록결정서 조회 (IntermediateDocumentRGService)

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const {
    mode,
    applicationNumber,
    tradeMarkName,
    classificationCode,
    similarityCode,
    // 거절결정서 검색용
    word,
    rejectionContent,
    sendDate,
  } = req.body;

  const ACCESS_KEY = process.env.KIPRIS_ACCESS_KEY;
  if (!ACCESS_KEY) return res.status(500).json({ error: "KIPRIS_ACCESS_KEY 환경변수 미설정" });

  // ── XML 파싱 유틸 ──────────────────────────────────────────
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

  // 출원번호 포맷: 13자리 숫자 → XX-XXXX-XXXXXXX
  const fmtAppNum = (raw) => {
    const s = (raw || "").replace(/\D/g, "");
    if (s.length === 13) return `${s.slice(0,2)}-${s.slice(2,6)}-${s.slice(6)}`;
    return raw;
  };

  // 출원번호 앞 두 자리로 서비스 분기
  // 40 → 상표(TM), 30 → 디자인(DG), 10/20 → 특허/실용신안 (미지원)
  const detectService = (appNum) => {
    const s = (appNum || "").replace(/\D/g, "");
    const prefix = s.slice(0, 2);
    if (prefix === "30") return "DG";
    return "TM"; // 40, 기타 모두 TM 시도
  };

  // 이력 XML 공통 파서
  const parseHistoryXml = (xml, blockTag) => {
    const blocks = getTagAll(xml, blockTag);
    return blocks.map(block => {
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
  };

  // ══════════════════════════════════════════════════════════
  // 모드 1: 출원번호 행정처리이력 (상표 / 디자인 자동 분기)
  // ══════════════════════════════════════════════════════════
  if (!mode || mode === "history") {
    if (!applicationNumber) return res.status(400).json({ error: "applicationNumber required" });
    const numClean = applicationNumber.replace(/\D/g, "");
    const svc = detectService(applicationNumber);

    // 서비스별 URL & 블록 태그 결정
    const urlMap = {
      TM: `http://plus.kipris.or.kr/openapi/rest/RelatedDocsonfileTMService/relatedDocsonfileInfo?applicationNumber=${numClean}&accessKey=${encodeURIComponent(ACCESS_KEY)}`,
      DG: `http://plus.kipris.or.kr/openapi/rest/RelatedDocsonfileDGService/relatedDocsonfileInfo?applicationNumber=${numClean}&accessKey=${encodeURIComponent(ACCESS_KEY)}`,
    };
    const blockTagMap = { TM: "relateddocsonfileInfo", DG: "relateddocsonfileInfo" };

    try {
      const resp = await fetch(urlMap[svc]);
      const xml  = await resp.text();

      const resultCode = getTag1(xml, "resultCode");
      const resultMsg  = getTag1(xml, "resultMsg");

      // 블록 태그 순서대로 시도
      let items = [];
      for (const tag of [blockTagMap[svc], "item"]) {
        const parsed = parseHistoryXml(xml, tag);
        if (parsed.length > 0) { items = parsed; break; }
      }

      const registrationNumber = items.map(i => i.registrationNumber).find(r => r?.trim()) || null;
      const latestStep = items.length > 0 ? items[items.length - 1].step : null;

      return res.status(200).json({
        resultCode, resultMsg, items, registrationNumber, latestStep,
        serviceType: svc, // "TM" | "DG" — 프론트에서 단계 표시에 활용 가능
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ══════════════════════════════════════════════════════════
  // 모드 2: 상표명 검색
  // URL: http://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService/getWordSearch
  // ══════════════════════════════════════════════════════════
  if (mode === "search") {
    if (!tradeMarkName && !classificationCode && !similarityCode) {
      return res.status(400).json({ error: "검색 조건을 하나 이상 입력해주세요" });
    }

    const params = new URLSearchParams({
      ServiceKey:       ACCESS_KEY,
      searchRecentYear: "0",
      numOfRows:        "30",
      pageNo:           "1",
    });
    if (tradeMarkName)      params.append("searchString",       tradeMarkName);
    if (classificationCode) params.append("classificationCode", classificationCode.replace(/[^0-9]/g, "").padStart(2, "0"));

    const url = `http://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService/getWordSearch?${params.toString()}`;

    try {
      const resp = await fetch(url);
      const xml  = await resp.text();

      const resultCode = getTag1(xml, "resultCode");
      const resultMsg  = getTag1(xml, "resultMsg");
      const totalCount = getTag1(xml, "totalCount");

      const itemBlocks = getTagAll(xml, "item");
      const items = itemBlocks.map(block => {
        const g = (t) => getTag1(block, t);
        const rawNum = g("applicationNumber");
        return {
          applicationNumber:  fmtAppNum(rawNum),
          applicationNumberRaw: rawNum,
          tradeMarkName:      g("title"),
          drawing:            g("drawing"),
          bigDrawing:         g("bigDrawing"),
          applicantName:      g("applicantName"),
          applicationDate:    fmtDate(g("applicationDate")),
          applicationStatus:  g("applicationStatus"),
          classificationCode: g("classificationCode"),
          registrationNumber: g("registrationNumber"),
          registrationDate:   fmtDate(g("registrationDate")),
        };
      });

      return res.status(200).json({
        resultCode, resultMsg,
        items,
        totalCount: parseInt(totalCount) || items.length,
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ══════════════════════════════════════════════════════════
  // 모드 3: 거절결정서 검색
  // URL: http://plus.kipris.or.kr/openapi/rest/IntermediateDocumentREService/advancedSearchInfo
  // ══════════════════════════════════════════════════════════
  if (mode === "rejection") {
    const params = new URLSearchParams({
      accessKey:  ACCESS_KEY,
      tradeMark:  "true",  // 상표 포함
      patent:     "false",
      utility:    "false",
      design:     "false",
      docsCount:  "30",
      docsStart:  "1",
      descSort:   "true",
    });
    if (applicationNumber) params.append("applicationNumber", applicationNumber.replace(/\D/g, ""));
    if (word)              params.append("word",              word);
    if (rejectionContent)  params.append("rejectionContent",  rejectionContent);
    if (sendDate)          params.append("sendDate",          sendDate);

    if (!applicationNumber && !word && !rejectionContent) {
      return res.status(400).json({ error: "applicationNumber 또는 word/rejectionContent 중 하나 필요" });
    }

    const url = `http://plus.kipris.or.kr/openapi/rest/IntermediateDocumentREService/advancedSearchInfo?${params.toString()}`;

    try {
      const resp = await fetch(url);
      const xml  = await resp.text();

      const resultCode = getTag1(xml, "resultCode");
      const resultMsg  = getTag1(xml, "resultMsg");

      const itemBlocks = getTagAll(xml, "advancedSearchInfo");
      const items = itemBlocks.map(block => {
        const g = (t) => getTag1(block, t);
        return {
          applicationNumber: fmtAppNum(g("applicationNumber")),
          sendNumber:        g("sendNumber"),
          sendDate:          fmtDate(g("sendDate")),
          title:             g("title"),
          filePath:          g("filePath"),  // PDF 다운로드 경로
        };
      });

      return res.status(200).json({ resultCode, resultMsg, items });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ══════════════════════════════════════════════════════════
  // 모드 4: 등록결정서 조회
  // URL: http://plus.kipris.or.kr/openapi/rest/IntermediateDocumentRGService/bibliographicInfo
  // ══════════════════════════════════════════════════════════
  if (mode === "register") {
    if (!applicationNumber) return res.status(400).json({ error: "applicationNumber required" });
    const numClean = applicationNumber.replace(/\D/g, "");

    const url = `http://plus.kipris.or.kr/openapi/rest/IntermediateDocumentRGService/bibliographicInfo?applicationNumber=${numClean}&accessKey=${encodeURIComponent(ACCESS_KEY)}`;

    try {
      const resp = await fetch(url);
      const xml  = await resp.text();

      const resultCode = getTag1(xml, "resultCode");
      const resultMsg  = getTag1(xml, "resultMsg");

      // 블록 태그: bibliographicInfo 또는 bibliographicInfoList > bibliographicInfo
      const itemBlocks = getTagAll(xml, "bibliographicInfo");
      const items = itemBlocks.map(block => {
        const g = (t) => getTag1(block, t);
        return {
          applicationNumber:        fmtAppNum(g("applicationNumber")),
          sendNumber:               g("sendNumber"),
          documentSendNumber:       g("documentSendNumber"),
          sendDate:                 fmtDate(g("sendDate")),
          documentSentence:         g("documentSentence"),
          documentType:             g("documentType"),
          documentName:             g("documentName"),
          documentDrawupDate:       fmtDate(g("documentDrawupDate")),
          inventionName:            g("inventionName"),
          demandItemcount:          g("demandItemcount"),
          originalRegistrationNumber: g("originalRegistrationNumber"),
        };
      });

      return res.status(200).json({ resultCode, resultMsg, items });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: "mode must be one of: history, search, rejection, register" });
}
