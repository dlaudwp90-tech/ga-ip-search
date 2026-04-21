// pages/api/all.js
// sort + filters 지원 버전

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
    return { title, typeItems, statusItem, categoryItems, docWorkStatusItem, appNum, appOwner, agentCode, deadline, url, fileLinks, pageId };
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
