export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const NOTION_KEY = process.env.NOTION_API_KEY;
  const DB_ID = process.env.NOTION_DB_ID;

  try {
    let count = 0;
    let cursor = undefined;
    let hasMore = true;
    while (hasMore) {
      const body = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const response = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${NOTION_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.message });
      count += (data.results || []).length;
      hasMore = data.has_more;
      cursor = data.next_cursor;
    }
    return res.status(200).json({ count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
