export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: "query required" });

  const NOTION_KEY = process.env.NOTION_API_KEY;
  const DB_ID = process.env.NOTION_DB_ID;

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: {
          or: [
            { property: "Name", title: { contains: query } },
            { property: "이름", title: { contains: query } },
          ],
        },
        page_size: 30,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || "Notion API error" });
    }

    const results = (data.results || []).map((page) => {
      // 제목 추출 (Name 또는 이름 프로퍼티)
      const titleProp =
        page.properties?.Name?.title ||
        page.properties?.이름?.title ||
        Object.values(page.properties || {}).find((p) => p.type === "title")?.title ||
        [];
      const title = titleProp.map((t) => t.plain_text).join("") || "(제목 없음)";

      // 상태 추출
      const statusProp = page.properties?.상태?.status?.name ||
        page.properties?.Status?.status?.name ||
        page.properties?.상태?.select?.name ||
        "";

      // 유형 추출
      const typeProp = page.properties?.유형?.select?.name ||
        page.properties?.Type?.select?.name ||
        page.properties?.분류?.select?.name ||
        "";

      // URL
      const url = page.url || "";

      return { title, status: statusProp, type: typeProp, url };
    });

    res.status(200).json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
