// pages/api/claude-access.js
// Claude 전용 접근 API — 로그인 없이 비밀키로 인증
//
// 사용법 (Claude에게 이렇게 요청):
//   POST https://staff.markangel.co.kr/api/claude-access
//   { "key": "[CLAUDE_ACCESS_KEY]", "action": "kipris-search", "params": { ... } }
//
// 지원 액션:
//   kipris-search   — 상표 검색
//   kipris-history  — 출원번호 행정처리이력
//   kipris-detail   — 출원번호 상세정보
//   notion-cases    — Notion DB 케이스 목록
//   notion-create   — Notion DB 새 케이스 생성
//   notion-update   — Notion DB 케이스 업데이트
//   ping            — 연결 확인

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { key, action, params = {} } = req.body || {};

  // ── 인증 ──
  const CLAUDE_KEY = process.env.CLAUDE_ACCESS_KEY;
  if (!CLAUDE_KEY) return res.status(500).json({ error: "CLAUDE_ACCESS_KEY 환경변수 미설정" });
  if (key !== CLAUDE_KEY) return res.status(401).json({ error: "Unauthorized" });

  const KIPRIS_KEY  = process.env.KIPRIS_ACCESS_KEY;
  const NOTION_KEY  = process.env.NOTION_API_KEY;
  const DB_ID       = process.env.NOTION_DB_ID;

  // ── 공통 유틸 ──
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

  try {
    // ════════════════════════════════════════════════════
    // PING — 연결 확인
    // ════════════════════════════════════════════════════
    if (action === "ping") {
      return res.status(200).json({
        ok: true,
        message: "G&A IP 인트라넷 연결 확인",
        timestamp: new Date().toISOString(),
        availableActions: [
          "ping",
          "kipris-search",
          "kipris-history",
          "kipris-detail",
          "notion-cases",
          "notion-create",
          "notion-update",
        ],
      });
    }

    // ════════════════════════════════════════════════════
    // KIPRIS — 상표 검색
    // params: { tradeMarkName, applicantName, agentName,
    //           classificationCode, similarityCode, extraQuery, pageNo }
    // ════════════════════════════════════════════════════
    if (action === "kipris-search") {
      if (!KIPRIS_KEY) return res.status(500).json({ error: "KIPRIS_ACCESS_KEY 미설정" });

      const { tradeMarkName, applicantName, agentName,
              classificationCode, similarityCode, extraQuery, pageNo = 1 } = params;

      const queryParts = [];
      if (tradeMarkName)      queryParts.push(tradeMarkName.trim());
      if (applicantName)      queryParts.push(`AP=[${applicantName.trim()}]`);
      if (agentName)          queryParts.push(`AG=[${agentName.trim()}]`);
      if (classificationCode) {
        const codes = classificationCode.replace(/[^0-9,]/g,"").split(",").filter(Boolean);
        if (codes.length === 1) queryParts.push(`CL=[${codes[0].padStart(2,"0")}]`);
        else if (codes.length > 1) queryParts.push("("+codes.map(c=>`CL=[${c.padStart(2,"0")}]`).join("+")+")");
      }
      if (similarityCode) {
        const codes = similarityCode.toUpperCase().split(",").map(s=>s.trim()).filter(Boolean);
        if (codes.length === 1) queryParts.push(`SC=[${codes[0]}]`);
        else if (codes.length > 1) queryParts.push("("+codes.map(c=>`SC=[${c}]`).join("+")+")");
      }
      if (extraQuery) queryParts.push(extraQuery.trim());

      if (queryParts.length === 0) return res.status(400).json({ error: "검색 조건을 하나 이상 입력해주세요" });

      const finalQuery = queryParts.join("*");
      const qs = new URLSearchParams({ ServiceKey: KIPRIS_KEY, searchRecentYear: "0", numOfRows: "30", pageNo: String(pageNo) });
      qs.append("searchString", finalQuery);

      const xml = await (await fetch(`http://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService/getWordSearch?${qs}`)).text();

      const items = getAll(xml, "item").map(b => {
        const g = (t) => get1(b, t);
        return {
          applicationNumber: fmtAppNum(g("applicationNumber")),
          tradeMarkName:     g("title"),
          drawing:           g("drawing"),
          applicantName:     g("applicantName"),
          agentName:         g("agentName"),
          applicationDate:   fmtDate(g("applicationDate")),
          applicationStatus: g("applicationStatus"),
          classificationCode: g("classificationCode"),
          registrationNumber: g("registrationNumber"),
        };
      });

      return res.status(200).json({
        finalQuery,
        totalCount: parseInt(get1(xml, "totalCount")) || items.length,
        pageNo,
        items,
      });
    }

    // ════════════════════════════════════════════════════
    // KIPRIS — 출원번호 행정처리이력
    // params: { applicationNumber }
    // ════════════════════════════════════════════════════
    if (action === "kipris-history") {
      if (!KIPRIS_KEY) return res.status(500).json({ error: "KIPRIS_ACCESS_KEY 미설정" });
      const { applicationNumber } = params;
      if (!applicationNumber) return res.status(400).json({ error: "applicationNumber required" });

      const numClean = applicationNumber.replace(/\D/g, "");
      const svc = numClean.slice(0,2) === "30" ? "DG" : "TM";
      const url = svc === "TM"
        ? `http://plus.kipris.or.kr/openapi/rest/RelatedDocsonfileTMService/relatedDocsonfileInfo?applicationNumber=${numClean}&accessKey=${encodeURIComponent(KIPRIS_KEY)}`
        : `http://plus.kipris.or.kr/openapi/rest/RelatedDocsonfileDGService/relatedDocsonfileInfo?applicationNumber=${numClean}&accessKey=${encodeURIComponent(KIPRIS_KEY)}`;

      const xml = await (await fetch(url)).text();
      let items = [];
      for (const tag of ["relateddocsonfileInfo", "item"]) {
        const blocks = getAll(xml, tag);
        if (blocks.length > 0) {
          items = blocks.map(b => {
            const g = (t) => get1(b, t);
            return {
              applicationNumber: fmtAppNum(g("applicationNumber")),
              documentDate:      g("documentDate"),
              documentDateFmt:   fmtDate(g("documentDate")),
              documentTitle:     g("documentTitle"),
              status:            g("status"),
              step:              g("step"),
              registrationNumber: g("registrationNumber"),
            };
          });
          break;
        }
      }

      return res.status(200).json({
        applicationNumber: fmtAppNum(applicationNumber),
        serviceType: svc,
        registrationNumber: items.map(i=>i.registrationNumber).find(r=>r?.trim()) || null,
        latestStep: items.length > 0 ? items[items.length-1].step : null,
        items,
      });
    }

    // ════════════════════════════════════════════════════
    // KIPRIS — 출원번호 상세정보 (서지+인명)
    // params: { applicationNumber }
    // ════════════════════════════════════════════════════
    if (action === "kipris-detail") {
      if (!KIPRIS_KEY) return res.status(500).json({ error: "KIPRIS_ACCESS_KEY 미설정" });
      const { applicationNumber } = params;
      if (!applicationNumber) return res.status(400).json({ error: "applicationNumber required" });

      const numClean = applicationNumber.replace(/\D/g, "");
      const url = `http://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService/getBibliographyDetailInfoSearch?applicationNumber=${numClean}&accessKey=${encodeURIComponent(KIPRIS_KEY)}`;
      const xml = await (await fetch(url)).text();

      let bibliography = null;
      for (const tag of ["biblioSummaryInfo", "item"]) {
        const blocks = getAll(xml, tag);
        if (blocks.length > 0) {
          const inner = getAll(blocks[0], "biblioSummaryInfo");
          const b = inner.length > 0 ? inner[0] : blocks[0];
          const g = (t) => get1(b, t);
          if (g("applicationNumber")) {
            bibliography = {
              applicationNumber:   fmtAppNum(g("applicationNumber")),
              applicationDate:     fmtDate(g("applicationDate")),
              title:               g("title"),
              applicationStatus:   g("applicationStatus"),
              classificationCode:  g("classificationCode"),
              registrationNumber:  g("registrationNumber"),
              registrationDate:    fmtDate(g("registrationDate")),
              publicationNumber:   g("publicationNumber") || g("publicNumber"),
              publicationDate:     fmtDate(g("publicationDate") || g("publicDate")),
              drawing:             g("drawing"),
              bigDrawing:          g("bigDrawing"),
            };
            break;
          }
        }
      }

      const grabPersons = (arrayTag, itemTag, role) => {
        const arrays = getAll(xml, arrayTag);
        const blocks = arrays.length > 0 ? arrays.flatMap(a=>getAll(a,itemTag)) : getAll(xml, itemTag);
        return blocks.map(b => {
          const g = (t) => get1(b, t);
          return { name: g("name")||g("applicantName")||g("agentName"), code: g("code")||g("customerNumber"), role };
        }).filter(x => x.name);
      };

      return res.status(200).json({
        bibliography,
        applicants: [
          ...grabPersons("applicantInfoArray", "applicantInfo", "출원인"),
          ...grabPersons("agentInfoArray", "agentInfo", "대리인"),
          ...grabPersons("rightHolderInfoArray", "rightHolderInfo", "권리자"),
        ],
      });
    }

    // ════════════════════════════════════════════════════
    // NOTION — 케이스 목록 조회
    // params: { filter?, limit? }
    //   filter: "출원서 작성 중" | "출원완료" | "초안" 등 상태값
    // ════════════════════════════════════════════════════
    if (action === "notion-cases") {
      if (!NOTION_KEY || !DB_ID) return res.status(500).json({ error: "Notion 환경변수 미설정" });

      const { filter, limit = 20 } = params;
      const body = {
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        page_size: Math.min(limit, 100),
      };
      if (filter) {
        body.filter = { property: "상태(대표 결)", status: { equals: filter } };
      }

      const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${NOTION_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: d.message });

      const cases = (d.results || []).map(p => {
        const props = p.properties || {};
        const getText = (name) => (props[name]?.rich_text || []).map(t=>t.plain_text).join("") || "";
        const getTitle = (name) => (props[name]?.title || []).map(t=>t.plain_text).join("") || "";
        return {
          pageId:          p.id,
          name:            getTitle("이름(상표/디자인)"),
          type:            (props["특허/상표/디자인"]?.multi_select || []).map(s=>s.name).join(", "),
          status:          props["상태(대표 결)"]?.status?.name || "",
          applicant:       getText("출원인(특허고객번호)"),
          applicationNumber: getText("출원번호"),
          goodsClass:      (props["상품류"]?.multi_select || []).map(s=>s.name).join(", "),
          lastEdited:      p.last_edited_time,
        };
      });

      return res.status(200).json({ total: cases.length, cases });
    }

    // ════════════════════════════════════════════════════
    // NOTION — 케이스 생성
    // params: { name, applicant, applicationNumber?, goodsClass?, status? }
    // ════════════════════════════════════════════════════
    if (action === "notion-create") {
      if (!NOTION_KEY || !DB_ID) return res.status(500).json({ error: "Notion 환경변수 미설정" });

      const { name, applicant, applicationNumber, goodsClass, status = "출원서 작성 중" } = params;
      if (!name) return res.status(400).json({ error: "name required" });

      const properties = {
        "이름(상표/디자인)": { title: [{ text: { content: name } }] },
        "상태(대표 결)":     { status: { name: status } },
        "특허/상표/디자인":  { multi_select: [{ name: "상표" }] },
      };
      if (applicant)         properties["출원인(특허고객번호)"] = { rich_text: [{ text: { content: applicant } }] };
      if (applicationNumber) properties["출원번호"]             = { rich_text: [{ text: { content: applicationNumber } }] };
      if (goodsClass)        properties["상품류"]               = { multi_select: [{ name: goodsClass }] };

      const r = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: { Authorization: `Bearer ${NOTION_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
        body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: DB_ID }, properties }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: d.message });

      return res.status(200).json({ ok: true, pageId: d.id, name });
    }

    // ════════════════════════════════════════════════════
    // NOTION — 케이스 업데이트
    // params: { pageId, status?, applicationNumber?, registrationNumber? }
    // ════════════════════════════════════════════════════
    if (action === "notion-update") {
      if (!NOTION_KEY) return res.status(500).json({ error: "Notion 환경변수 미설정" });

      const { pageId, status, applicationNumber, registrationNumber } = params;
      if (!pageId) return res.status(400).json({ error: "pageId required" });

      const properties = {};
      if (status)            properties["상태(대표 결)"] = { status: { name: status } };
      if (applicationNumber) properties["출원번호"]      = { rich_text: [{ text: { content: applicationNumber } }] };
      if (registrationNumber) properties["등록번호"]     = { rich_text: [{ text: { content: registrationNumber } }] };

      if (Object.keys(properties).length === 0) return res.status(400).json({ error: "변경할 항목이 없습니다" });

      const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${NOTION_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
        body: JSON.stringify({ properties }),
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: d.message });

      return res.status(200).json({ ok: true, pageId, updated: Object.keys(properties) });
    }

    // 알 수 없는 액션
    return res.status(400).json({
      error: `알 수 없는 action: "${action}"`,
      availableActions: ["ping","kipris-search","kipris-history","kipris-detail","notion-cases","notion-create","notion-update"],
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
