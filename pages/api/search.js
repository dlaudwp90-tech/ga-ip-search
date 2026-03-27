export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { query, mode, cursor } = req.body;
  // mode: "search" | "all"

  const NOTION_KEY = process.env.NOTION_API_KEY;
  const DB_ID = process.env.NOTION_DB_ID;

  try {
    let body = { page_size: 25 };

    if (cursor) body.start_cursor = cursor;

    if (mode === "all") {
      // 전체 조회 - 생성일자 내림차순
      body.sorts = [{ timestamp: "created_time", direction: "descending" }];
    } else {
      // 키워드 검색
      if (!query) return res.status(400).json({ error: "query required" });
      body.filter = {
        or: [
          { property: "이름(상표/디자인)", title: { contains: query } },
          { property: "출원번호", rich_text: { contains: query } },
          { property: "출원인(특허고객번호)", rich_text: { contains: query } },
          { property: "대리인 코드", rich_text: { contains: query } },
        ],
      };
      body.sorts = [{ timestamp: "created_time", direction: "descending" }];
      body.page_size = 50;
    }

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
    if (!response.ok) return res.status(response.status).json({ error: data.message || "Notion API error" });

    const results = (data.results || []).map((page) => {
      const props = page.properties || {};

      const titleArr = props["이름(상표/디자인)"]?.title || [];
      const title = titleArr.map((t) => t.plain_text).join("") || "(제목 없음)";

      const typeArr = props["특허/상표/디자인"]?.multi_select || [];
      const type = typeArr.map((t) => t.name).join(", ");

      const status = props["상태(대표 결)"]?.status?.name || "";

      const categoryArr = props["카테고리"]?.multi_select || [];
      const category = categoryArr.map((c) => c.name).join(", ");

      const appNum = props["출원번호"]?.rich_text?.map((t) => t.plain_text).join("") || "";
      const appOwner = props["출원인(특허고객번호)"]?.rich_text?.map((t) => t.plain_text).join("") || "";
      const agentCode = props["대리인 코드"]?.rich_text?.map((t) => t.plain_text).join("") || "";
      const deadline = props["필수 마감일"]?.date?.start || "";
      const url = page.url || "";
      const createdTime = page.created_time || "";

      return { title, type, status, category, appNum, appOwner, agentCode, deadline, url, createdTime };
    });

    res.status(200).json({
      results,
      next_cursor: data.next_cursor || null,
      has_more: data.has_more || false,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
