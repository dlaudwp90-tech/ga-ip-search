// ============================================================================
// pages/api/all.js  —  /all(전체보기) 목록 API (sort + filters 지원)
// ----------------------------------------------------------------------------
//  · 글자색/볼드 표시: 각 텍스트 속성의 '조각별 색·볼드 정보'
//    (titleSegs / appNumSegs / appOwnerSegs / agentCodeSegs)를 함께 내려줍니다.
//    /all 화면(all.js)이 이를 보고 색을 칠합니다.
//
//  ⚠ 수정 주의 — pages/api/search.js 와 같은 방식으로 맞춰져 있습니다. 한쪽만 바꾸지 마세요.
//   · 예전 버전은 '줄마다 색 1개'만 저장해서, 한 줄에 색이 두 개 이상이면
//     첫 색만 살아남고 나머지는 사라졌습니다. (예: "1차OA - "(파랑) + "기간연장"(빨강))
//   · 예전 필드(titleStyle / appNumStyles / …)도 호환을 위해 함께 내려보냅니다.
// ============================================================================

// ── 노션 rich_text → 줄별·조각별 색/볼드 정보 추출 ──
//   반환값: [ [ {t:"글자", c:"색이름|null", b:볼드여부}, ... ],  ← 1번째 줄의 조각들
//            [ ... ],                                          ← 2번째 줄의 조각들
//            [] ]                                              ← 빈 줄 (조각 없음)
function richToLineSegs(richArr) {
  if (!Array.isArray(richArr) || richArr.length === 0) return [];
  const lines = [[]];
  for (const seg of richArr) {
    const ann = seg.annotations || {};
    const color = (ann.color && ann.color !== "default") ? ann.color : null; // 'default'는 색 없음
    const bold = !!ann.bold;
    const parts = (seg.plain_text || "").split("\n");
    parts.forEach((part, pi) => {
      if (pi > 0) lines.push([]);   // 줄바꿈마다 새 줄 시작
      if (part === "") return;      // 빈 조각은 건너뜀 (색이 다음 줄로 번지는 것 방지)
      lines[lines.length - 1].push({ t: part, c: color, b: bold });
    });
  }
  return lines;
}

// ── (호환용) 예전 방식: 줄마다 대표 색 1개 ──
function segsToLineStyles(lineSegs) {
  return lineSegs.map((segs) => {
    const out = { c: null, b: false };
    for (const s of segs) {
      if (s.c && !out.c) out.c = s.c;
      if (s.b) out.b = true;
    }
    return out;
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const {
    cursor,
    mode = "page",
    sort = "created_desc",        // 정렬 키
    filters = {},                 // { types:[], statuses:[], docWorkStates:[], categories:[], productClasses:[] }
  } = req.body;

  const NOTION_KEY = process.env.NOTION_API_KEY;
  const DB_ID = process.env.NOTION_DB_ID;

  // ─── parseRow (기존과 동일) ────────────────────────────
  const parseRow = (page) => {
    const props = page.properties || {};
    const titleArr = props["이름(상표/디자인)"]?.title || [];
    const title = titleArr.map((t) => t.plain_text).join("") || "(제목 없음)";
    const typeItems = (props["특허/상표/디자인"]?.multi_select || []).map((t) => ({ name: t.name, color: t.color || "default" }));
    const statusProp = props["상태(대표 결)"]?.status;
    const statusItem = statusProp ? { name: statusProp.name, color: statusProp.color || "default" } : null;
    const categoryItems = (props["카테고리"]?.multi_select || []).map((c) => ({ name: c.name, color: c.color || "default" }));
    const docWorkRaw = props["서류작업상태(작업자)"]?.status || props["서류작업상태(작업자)"]?.select || null;
    const docWorkStatusItem = docWorkRaw ? { name: docWorkRaw.name, color: docWorkRaw.color || "default" } : null;
    const appNum = props["출원번호"]?.rich_text?.map((t) => t.plain_text).join("") || "";
    const appOwner = props["출원인(특허고객번호)"]?.rich_text?.map((t) => t.plain_text).join("") || "";
    const agentCode = props["대리인 코드"]?.rich_text?.map((t) => t.plain_text).join("") || "";
    const deadline = props["필수 마감일"]?.date?.start || "";
    const url = page.url || "";
    const fileLinksRaw = props["파일다운링크"]?.rich_text?.map((t) => t.plain_text).join("") || "";
    const fileLinks = fileLinksRaw.split("\n").filter(Boolean).map((line) => {
      const match = line.match(/^\(.+?\)(https?:\/\/.+)$/);
      return match ? match[1] : line;
    }).join("\n");
    const pageId = page.id?.replace(/-/g, "") || "";
    const lastEditedTime = page.last_edited_time || "";
    // ↓ 노션 글자색·볼드(조각별) 정보 — /all 화면에서 그대로 표시하기 위해 함께 내려보냄
    const titleSegs     = richToLineSegs(titleArr);
    const appNumSegs    = richToLineSegs(props["출원번호"]?.rich_text);
    const appOwnerSegs  = richToLineSegs(props["출원인(특허고객번호)"]?.rich_text);
    const agentCodeSegs = richToLineSegs(props["대리인 코드"]?.rich_text);
    // ↓ (호환용) 예전 줄별 색 정보
    const appNumStyles    = segsToLineStyles(appNumSegs);
    const appOwnerStyles  = segsToLineStyles(appOwnerSegs);
    const agentCodeStyles = segsToLineStyles(agentCodeSegs);
    return { title, typeItems, statusItem, categoryItems, docWorkStatusItem, appNum, appOwner, agentCode, deadline, url, fileLinks, pageId, lastEditedTime,
             titleSegs, appNumSegs, appOwnerSegs, agentCodeSegs,
             titleStyle: segsToLineStyles(titleSegs)[0] || null, appNumStyles, appOwnerStyles, agentCodeStyles };
  };

  // ─── 정렬 키 → Notion sorts 매핑 ──────────────────────
  const buildSorts = (sortKey) => {
    switch (sortKey) {
      case "edited_desc":
        return [{ timestamp: "last_edited_time", direction: "descending" }];
      case "edited_asc":
        return [{ timestamp: "last_edited_time", direction: "ascending" }];
      case "created_asc":
        return [{ timestamp: "created_time", direction: "ascending" }];
      case "deadline_asc":
        return [{ property: "필수 마감일", direction: "ascending" }];
      case "deadline_desc":
        return [{ property: "필수 마감일", direction: "descending" }];
      case "created_desc":
      default:
        return [{ timestamp: "created_time", direction: "descending" }];
    }
  };

  // ─── 필터 객체 → Notion filter 빌드 ───────────────────
  // 같은 필터 내 복수 값 → OR
  // 서로 다른 필터 → AND
  const buildFilter = (f) => {
    const andGroups = [];

    const buildOrGroup = (values, propName, type) => {
      if (!values?.length) return null;
      const conditions = values.map((v) => {
        if (type === "multi_select") {
          return { property: propName, multi_select: { contains: v } };
        }
        if (type === "status") {
          return { property: propName, status: { equals: v } };
        }
        return null;
      }).filter(Boolean);
      if (conditions.length === 0) return null;
      if (conditions.length === 1) return conditions[0];
      return { or: conditions };
    };

    const typeG = buildOrGroup(f.types, "특허/상표/디자인", "multi_select");
    if (typeG) andGroups.push(typeG);

    const statusG = buildOrGroup(f.statuses, "상태(대표 결)", "status");
    if (statusG) andGroups.push(statusG);

    // 서류작업상태는 DB 스키마가 status/select 혼용 가능 — 기본은 status로 시도
    const docG = buildOrGroup(f.docWorkStates, "서류작업상태(작업자)", "status");
    if (docG) andGroups.push(docG);

    const catG = buildOrGroup(f.categories, "카테고리", "multi_select");
    if (catG) andGroups.push(catG);

    const classG = buildOrGroup(f.productClasses, "상품류", "multi_select");
    if (classG) andGroups.push(classG);

    if (andGroups.length === 0) return null;
    if (andGroups.length === 1) return andGroups[0];
    return { and: andGroups };
  };

  const SORTS = buildSorts(sort);
  const FILTER = buildFilter(filters);

  const buildBody = (pageSize, startCursor) => {
    const body = { sorts: SORTS, page_size: pageSize };
    if (FILTER) body.filter = FILTER;
    if (startCursor) body.start_cursor = startCursor;
    return body;
  };

  const queryNotion = async (body) => {
    const response = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  };

  try {
    if (mode === "all") {
      // 커서 이후 모든 레코드 조회
      let allResults = [];
      let cur = cursor || undefined;
      let hasMore = true;
      while (hasMore) {
        const { ok, status, data } = await queryNotion(buildBody(100, cur));
        if (!ok) return res.status(status).json({ error: data.message });
        allResults.push(...(data.results || []).map(parseRow));
        hasMore = data.has_more;
        cur = data.next_cursor;
      }
      return res.status(200).json({ results: allResults, hasMore: false, nextCursor: null });
    } else {
      // 25개 페이지 단위
      const { ok, status, data } = await queryNotion(buildBody(25, cursor));
      if (!ok) return res.status(status).json({ error: data.message });
      return res.status(200).json({
        results: (data.results || []).map(parseRow),
        hasMore: data.has_more || false,
        nextCursor: data.next_cursor || null,
      });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
