// pages/api/mcp.js
// G&A IP MCP 서버 — Model Context Protocol (JSON-RPC 2.0)
// Claude.ai Integrations에 등록하면 크롬 확장 없이 직접 사용 가능
//
// 인증: Authorization: Bearer {CLAUDE_ACCESS_KEY}
// 엔드포인트: https://staff.markangel.co.kr/api/mcp

export const config = { api: { bodyParser: true } };

// ── 도구 정의 ──────────────────────────────────────────────────
const TOOLS = [
  {
    name: "kipris_search",
    description: "KIPRIS에서 상표를 검색합니다. 상표명, 출원인, 대리인, 상품류, 유사군 조건으로 검색 가능합니다.",
    inputSchema: {
      type: "object",
      properties: {
        tradeMarkName:      { type: "string",  description: "검색할 상표명 (검색식 지원: * = AND, + = OR)" },
        applicantName:      { type: "string",  description: "출원인 이름 — 자동으로 AP=[이름] 변환" },
        agentName:          { type: "string",  description: "대리인 이름 — 자동으로 AG=[이름] 변환" },
        classificationCode: { type: "string",  description: "상품류 코드 (예: 35 또는 35,41)" },
        similarityCode:     { type: "string",  description: "유사군 코드 (예: G0301)" },
        extraQuery:         { type: "string",  description: "추가 검색식 (KIPRIS 필드 코드 직접 입력)" },
        pageNo:             { type: "number",  description: "페이지 번호 (기본값: 1, 30건/페이지)" },
      },
    },
  },
  {
    name: "kipris_history",
    description: "출원번호로 상표/디자인의 행정처리 이력(출원→심사→등록 전 과정)을 조회합니다.",
    inputSchema: {
      type: "object",
      required: ["applicationNumber"],
      properties: {
        applicationNumber: { type: "string", description: "출원번호 (예: 40-2026-0040463)" },
      },
    },
  },
  {
    name: "kipris_detail",
    description: "출원번호로 상표의 서지정보(출원일, 등록번호, 상표명 등)와 출원인/대리인 인명정보를 조회합니다.",
    inputSchema: {
      type: "object",
      required: ["applicationNumber"],
      properties: {
        applicationNumber: { type: "string", description: "출원번호 (예: 40-2026-0040463)" },
      },
    },
  },
  {
    name: "notion_cases",
    description: "가엔 Notion DB에서 상표/특허 케이스 목록을 조회합니다.",
    inputSchema: {
      type: "object",
      properties: {
        filter: { type: "string", description: "상태 필터 (예: 출원서 작성 중, 출원완료, 초안)" },
        limit:  { type: "number", description: "조회 건수 (기본값: 20, 최대: 100)" },
      },
    },
  },
  {
    name: "notion_create",
    description: "가엔 Notion DB에 새 상표/특허 케이스를 생성합니다.",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name:              { type: "string", description: "상표/디자인명 (필수)" },
        applicant:         { type: "string", description: "출원인(특허고객번호) (예: 정화란 (4-2022-045707-0))" },
        applicationNumber: { type: "string", description: "출원번호" },
        goodsClass:        { type: "string", description: "상품류 (예: 35류)" },
        status:            { type: "string", description: "상태 (기본값: 출원서 작성 중)" },
      },
    },
  },
  {
    name: "notion_update",
    description: "가엔 Notion DB의 케이스 상태, 출원번호, 등록번호를 업데이트합니다.",
    inputSchema: {
      type: "object",
      required: ["pageId"],
      properties: {
        pageId:             { type: "string", description: "Notion 페이지 ID" },
        status:             { type: "string", description: "변경할 상태" },
        applicationNumber:  { type: "string", description: "출원번호" },
        registrationNumber: { type: "string", description: "등록번호" },
      },
    },
  },
  {
    name: "ping",
    description: "G&A IP MCP 서버 연결 상태를 확인합니다.",
    inputSchema: { type: "object", properties: {} },
  },
];

// ── 도구 실행 ──────────────────────────────────────────────────
async function executeTool(name, args, env) {
  const { KIPRIS_KEY, NOTION_KEY, DB_ID } = env;

  // 공통 유틸
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

  // ── ping ──
  if (name === "ping") {
    return `✅ G&A IP MCP 서버 정상 작동 중\n시각: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}\n가용 도구: ${TOOLS.length}개`;
  }

  // ── kipris_search ──
  if (name === "kipris_search") {
    if (!KIPRIS_KEY) throw new Error("KIPRIS_ACCESS_KEY 미설정");
    const { tradeMarkName, applicantName, agentName, classificationCode, similarityCode, extraQuery, pageNo = 1 } = args;

    const queryParts = [];
    if (tradeMarkName)      queryParts.push(tradeMarkName.trim());
    if (applicantName)      queryParts.push(`AP=[${applicantName.trim()}]`);
    if (agentName)          queryParts.push(`AG=[${agentName.trim()}]`);
    if (classificationCode) {
      const codes = classificationCode.replace(/[^0-9,]/g, "").split(",").filter(Boolean);
      if (codes.length === 1) queryParts.push(`CL=[${codes[0].padStart(2, "0")}]`);
      else queryParts.push("(" + codes.map(c => `CL=[${c.padStart(2,"0")}]`).join("+") + ")");
    }
    if (similarityCode) {
      const codes = similarityCode.toUpperCase().split(",").map(s => s.trim()).filter(Boolean);
      if (codes.length === 1) queryParts.push(`SC=[${codes[0]}]`);
      else queryParts.push("(" + codes.map(c => `SC=[${c}]`).join("+") + ")");
    }
    if (extraQuery) queryParts.push(extraQuery.trim());
    if (queryParts.length === 0) throw new Error("검색 조건을 하나 이상 입력해주세요");

    const finalQuery = queryParts.join("*");
    const qs = new URLSearchParams({ ServiceKey: KIPRIS_KEY, searchRecentYear: "0", numOfRows: "30", pageNo: String(pageNo) });
    qs.append("searchString", finalQuery);

    const xml = await (await fetch(`http://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService/getWordSearch?${qs}`)).text();
    const totalCount = parseInt(get1(xml, "totalCount")) || 0;
    const items = getAll(xml, "item").map(b => {
      const g = t => get1(b, t);
      return {
        applicationNumber:  fmtAppNum(g("applicationNumber")),
        tradeMarkName:      g("title"),
        applicantName:      g("applicantName"),
        applicationDate:    fmtDate(g("applicationDate")),
        applicationStatus:  g("applicationStatus"),
        classificationCode: g("classificationCode"),
        registrationNumber: g("registrationNumber"),
        drawing:            g("drawing"),
      };
    });

    const lines = items.map((i, idx) =>
      `${(pageNo-1)*30 + idx + 1}. [${i.applicationStatus}] ${i.tradeMarkName || "(상표명없음)"}\n   출원번호: ${i.applicationNumber} | ${i.classificationCode}류 | 출원인: ${i.applicantName} | 출원일: ${i.applicationDate}${i.registrationNumber ? " | 등록번호: "+i.registrationNumber : ""}`
    ).join("\n\n");

    return `🔍 검색식: ${finalQuery}\n📊 총 ${totalCount.toLocaleString()}건 | ${pageNo}페이지\n${"─".repeat(40)}\n\n${lines || "결과 없음"}`;
  }

  // ── kipris_history ──
  if (name === "kipris_history") {
    if (!KIPRIS_KEY) throw new Error("KIPRIS_ACCESS_KEY 미설정");
    const { applicationNumber } = args;
    const numClean = applicationNumber.replace(/\D/g, "");
    const svc = numClean.slice(0,2) === "30" ? "DG" : "TM";
    const url = `http://plus.kipris.or.kr/openapi/rest/RelatedDocsonfile${svc}Service/relatedDocsonfileInfo?applicationNumber=${numClean}&accessKey=${encodeURIComponent(KIPRIS_KEY)}`;
    const xml = await (await fetch(url)).text();

    let items = [];
    for (const tag of ["relateddocsonfileInfo", "item"]) {
      const blocks = getAll(xml, tag);
      if (blocks.length > 0) {
        items = blocks.map(b => {
          const g = t => get1(b, t);
          return { date: fmtDate(g("documentDate")), title: g("documentTitle"), step: g("step"), status: g("status"), regNum: g("registrationNumber") };
        });
        break;
      }
    }

    const regNum = items.map(i => i.regNum).find(r => r?.trim()) || null;
    const latestStep = items.length > 0 ? items[items.length-1].step : "불명";

    const stageMap = { "출원": 1, "심판": 3, "등록": 4 };
    const stages = ["출원접수", "방식심사", "실체심사", "심판", "등록완료"];
    const currentIdx = stageMap[latestStep] ?? 0;
    const progress = stages.map((s, i) => i < currentIdx ? "✅" : i === currentIdx ? "▶️" : "⬜").join(" → ") + "\n" + stages.join(" → ");

    const history = [...items].reverse().map(i =>
      `[${i.date}] ${i.step} | ${i.title}${i.status ? " ("+i.status+")" : ""}${i.regNum ? " → 등록번호: "+i.regNum : ""}`
    ).join("\n");

    return `📋 출원번호: ${fmtAppNum(applicationNumber)}\n현재단계: ${latestStep}${regNum ? " | 등록번호: "+regNum : ""}\n\n${progress}\n\n${"─".repeat(40)}\n📄 전체 이력 (${items.length}건)\n\n${history}`;
  }

  // ── kipris_detail ──
  if (name === "kipris_detail") {
    if (!KIPRIS_KEY) throw new Error("KIPRIS_ACCESS_KEY 미설정");
    const { applicationNumber } = args;
    const numClean = applicationNumber.replace(/\D/g, "");
    const xml = await (await fetch(`http://plus.kipris.or.kr/kipo-api/kipi/trademarkInfoSearchService/getBibliographyDetailInfoSearch?applicationNumber=${numClean}&accessKey=${encodeURIComponent(KIPRIS_KEY)}`)).text();

    let bib = null;
    for (const tag of ["biblioSummaryInfo", "item"]) {
      const blocks = getAll(xml, tag);
      if (blocks.length > 0) {
        const inner = getAll(blocks[0], "biblioSummaryInfo");
        const b = inner.length > 0 ? inner[0] : blocks[0];
        const g = t => get1(b, t);
        if (g("applicationNumber")) {
          bib = { appNum: fmtAppNum(g("applicationNumber")), appDate: fmtDate(g("applicationDate")), title: g("title"), status: g("applicationStatus"), cls: g("classificationCode"), regNum: g("registrationNumber"), regDate: fmtDate(g("registrationDate")), pubNum: g("publicationNumber")||g("publicNumber"), pubDate: fmtDate(g("publicationDate")||g("publicDate")), vienna: g("viennaCode") };
          break;
        }
      }
    }

    const grabPersons = (arrayTag, itemTag, role) => {
      const arrays = getAll(xml, arrayTag);
      const blocks = arrays.length > 0 ? arrays.flatMap(a => getAll(a, itemTag)) : getAll(xml, itemTag);
      return blocks.map(b => { const g = t => get1(b, t); return { name: g("name")||g("applicantName")||g("agentName"), code: g("code")||g("customerNumber"), role }; }).filter(x => x.name);
    };
    const persons = [
      ...grabPersons("applicantInfoArray", "applicantInfo", "출원인"),
      ...grabPersons("agentInfoArray", "agentInfo", "대리인"),
      ...grabPersons("rightHolderInfoArray", "rightHolderInfo", "권리자"),
    ];

    if (!bib) return "서지정보를 불러올 수 없습니다.";

    const bibText = [
      `📋 서지정보`,
      `상표명: ${bib.title}`,
      `출원번호: ${bib.appNum}`,
      `출원일: ${bib.appDate}`,
      `출원상태: ${bib.status}`,
      `상품류: ${bib.cls}`,
      bib.regNum   ? `등록번호: ${bib.regNum} (${bib.regDate})` : null,
      bib.pubNum   ? `출원공고번호: ${bib.pubNum} (${bib.pubDate})` : null,
      bib.vienna   ? `비엔나코드: ${bib.vienna}` : null,
    ].filter(Boolean).join("\n");

    const personText = persons.length > 0
      ? "\n\n👥 인명정보\n" + persons.map(p => `[${p.role}] ${p.name}${p.code ? " ("+p.code+")" : ""}`).join("\n")
      : "";

    return bibText + personText;
  }

  // ── notion_cases ──
  if (name === "notion_cases") {
    if (!NOTION_KEY || !DB_ID) throw new Error("Notion 환경변수 미설정");
    const { filter, limit = 20 } = args;
    const body = { sorts: [{ timestamp: "last_edited_time", direction: "descending" }], page_size: Math.min(limit, 100) };
    if (filter) body.filter = { property: "상태(대표 결)", status: { equals: filter } };

    const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${NOTION_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message);

    const cases = (d.results || []).map(p => {
      const props = p.properties || {};
      const getText  = name => (props[name]?.rich_text || []).map(t => t.plain_text).join("") || "";
      const getTitle = name => (props[name]?.title     || []).map(t => t.plain_text).join("") || "";
      return {
        pageId:    p.id,
        name:      getTitle("이름(상표/디자인)"),
        status:    props["상태(대표 결)"]?.status?.name || "",
        applicant: getText("출원인(특허고객번호)"),
        appNum:    getText("출원번호"),
        cls:       (props["상품류"]?.multi_select || []).map(s => s.name).join(", "),
      };
    });

    const lines = cases.map((c, i) =>
      `${i+1}. [${c.status}] ${c.name}\n   출원인: ${c.applicant || "-"} | 상품류: ${c.cls || "-"} | 출원번호: ${c.appNum || "-"}\n   페이지ID: ${c.pageId}`
    ).join("\n\n");

    return `📁 가엔 DB 케이스 목록 (${cases.length}건)\n${"─".repeat(40)}\n\n${lines || "케이스 없음"}`;
  }

  // ── notion_create ──
  if (name === "notion_create") {
    if (!NOTION_KEY || !DB_ID) throw new Error("Notion 환경변수 미설정");
    const { name: caseName, applicant, applicationNumber, goodsClass, status = "출원서 작성 중" } = args;
    const properties = {
      "이름(상표/디자인)": { title: [{ text: { content: caseName } }] },
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
    if (!r.ok) throw new Error(d.message);
    return `✅ 케이스 생성 완료\n상표명: ${caseName}\n상태: ${status}\n페이지ID: ${d.id}`;
  }

  // ── notion_update ──
  if (name === "notion_update") {
    if (!NOTION_KEY) throw new Error("NOTION_API_KEY 미설정");
    const { pageId, status, applicationNumber, registrationNumber } = args;
    const properties = {};
    if (status)             properties["상태(대표 결)"] = { status: { name: status } };
    if (applicationNumber)  properties["출원번호"]      = { rich_text: [{ text: { content: applicationNumber } }] };
    if (registrationNumber) properties["등록번호"]      = { rich_text: [{ text: { content: registrationNumber } }] };
    if (Object.keys(properties).length === 0) throw new Error("변경할 항목이 없습니다");

    const r = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${NOTION_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: JSON.stringify({ properties }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.message);
    return `✅ 케이스 업데이트 완료\n페이지ID: ${pageId}\n변경항목: ${Object.keys(properties).join(", ")}`;
  }

  throw new Error(`알 수 없는 도구: ${name}`);
}

// ── MCP 핸들러 ──────────────────────────────────────────────────
export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, Mcp-Session-Id");
  if (req.method === "OPTIONS") return res.status(200).end();

  // 인증 — Claude.ai 커스텀 커넥터는 OAuth만 지원하므로
  // URL 자체를 비밀키로 활용 (Notion 비공개 페이지에 저장됨)
  // 필요 시 OAuth 추가 가능

  const env = {
    KIPRIS_KEY: process.env.KIPRIS_ACCESS_KEY,
    NOTION_KEY: process.env.NOTION_API_KEY,
    DB_ID:      process.env.NOTION_DB_ID,
  };

  // GET → SSE 연결 (Claude.ai 연결 확인용)
  if (req.method === "GET") {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.write(`data: ${JSON.stringify({ type: "connected", server: "G&A IP MCP", version: "1.0.0" })}\n\n`);
    const keep = setInterval(() => res.write(":ping\n\n"), 20000);
    req.on("close", () => clearInterval(keep));
    return;
  }

  if (req.method !== "POST") return res.status(405).end();

  const { jsonrpc, id, method, params } = req.body || {};
  if (jsonrpc !== "2.0") return res.status(400).json({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid Request" } });

  const ok = (result) => res.status(200).json({ jsonrpc: "2.0", id, result });
  const err = (code, msg) => res.status(200).json({ jsonrpc: "2.0", id, error: { code, message: msg } });

  try {
    // initialize
    if (method === "initialize") {
      return ok({
        protocolVersion: "2024-11-05",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "GA-IP MCP", version: "1.0.0" },
        instructions: "G&A IP 특허법률사무소 인트라넷 MCP. KIPRIS 상표 검색/이력 조회 및 Notion DB 케이스 관리 도구를 제공합니다.",
      });
    }

    // initialized (알림 — 응답 없음)
    if (method === "notifications/initialized") return res.status(200).end();

    // tools/list
    if (method === "tools/list") return ok({ tools: TOOLS });

    // tools/call
    if (method === "tools/call") {
      const { name, arguments: args = {} } = params || {};
      if (!name) return err(-32602, "tool name required");
      const text = await executeTool(name, args, env);
      return ok({ content: [{ type: "text", text }] });
    }

    // ping
    if (method === "ping") return ok({});

    return err(-32601, `Method not found: ${method}`);

  } catch (e) {
    return ok({ content: [{ type: "text", text: `❌ 오류: ${e.message}` }], isError: true });
  }
}
