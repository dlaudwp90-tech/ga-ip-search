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
            { property: "이름(상표/디자인)", title: { contains: query } },
            { property: "출원번호", rich_text: { contains: query } },
            { property: "출원인(특허고객번호)", rich_text: { contains: query } },
            { property: "대리인 코드", rich_text: { contains: query } },
          ],
        },
        page_size: 50,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || "Notion API error" });
    }

    const results = (data.results || []).map((page) => {
      const props = page.properties || {};

      // 제목: 이름(상표/디자인)
      const titleArr = props["이름(상표/디자인)"]?.title || [];
      const title = titleArr.map((t) => t.plain_text).join("") || "(제목 없음)";

      // 유형: 특허/상표/디자인 (multi_select)
      const typeArr = props["특허/상표/디자인"]?.multi_select || [];
      const type = typeArr.map((t) => t.name).join(", ");

      // 상태: 상태(대표 결) (status)
      const status = props["상태(대표 결)"]?.status?.name || "";

      // 카테고리 (multi_select)
      const categoryArr = props["카테고리"]?.multi_select || [];
      const category = categoryArr.map((c) => c.name).join(", ");

      // 출원번호
      const appNum = props["출원번호"]?.rich_text?.map((t) => t.plain_text).join("") || "";

      // 마감일
      const deadline = props["필수 마감일"]?.date?.start || "";

      const url = page.url || "";

      return { title, type, status, category, appNum, deadline, url };
    });

    res.status(200).json({ results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
