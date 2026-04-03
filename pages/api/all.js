export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { cursor, mode = "page" } = req.body;
  const NOTION_KEY = process.env.NOTION_API_KEY;
  const DB_ID = process.env.NOTION_DB_ID;

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
    return { title, typeItems, statusItem, categoryItems, docWorkStatusItem, appNum, appOwner, agentCode, deadline, url, fileLinks };
  };

  const SORTS = [{ timestamp: "created_time", direction: "ascending" }];

  try {
    if (mode === "all") {
      // 커서 이후 모든 레코드 조회
      let allResults = [];
      let cur = cursor || undefined;
      let hasMore = true;
      while (hasMore) {
        const body = { sorts: SORTS, page_size: 100 };
        if (cur) body.start_cursor = cur;
        const response = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
          method: "POST",
          headers: { Authorization: `Bearer ${NOTION_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json({ error: data.message });
        allResults.push(...(data.results || []).map(parseRow));
        hasMore = data.has_more;
        cur = data.next_cursor;
      }
      return res.status(200).json({ results: allResults, hasMore: false, nextCursor: null });
    } else {
      // 25개 페이지 단위 조회
      const body = { sorts: SORTS, page_size: 25 };
      if (cursor) body.start_cursor = cursor;
      const response = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${NOTION_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.message });
      return res.status(200).json({
        results: (data.results || []).map(parseRow),
        hasMore: data.has_more || false,
        nextCursor: data.next_cursor || null,
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
