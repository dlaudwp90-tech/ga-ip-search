// pages/api/count.js
// 전체 문서 수 + 상품류별 건수를 한 번의 DB 순회로 집계

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const NOTION_KEY = process.env.NOTION_API_KEY;
  const DB_ID = process.env.NOTION_DB_ID;

  try {
    let count = 0;
    const classCounts = {};        // { "01류": 12, "02류": 3, ... }
    let cursor = undefined;
    let hasMore = true;

    while (hasMore) {
      const body = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
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
      if (!response.ok) return res.status(response.status).json({ error: data.message });

      const pages = data.results || [];
      count += pages.length;

      // 각 페이지의 상품류 multi_select를 카운트
      for (const page of pages) {
        const classes = page.properties?.["상품류"]?.multi_select || [];
        for (const c of classes) {
          if (!c?.name) continue;
          classCounts[c.name] = (classCounts[c.name] || 0) + 1;
        }
      }

      hasMore = data.has_more;
      cursor = data.next_cursor;
    }

    return res.status(200).json({ count, classCounts });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
