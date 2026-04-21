// pages/api/forms.js
// Notion API 2025-09-03 버전 — data_source 엔드포인트 사용

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const NOTION_KEY = process.env.NOTION_API_KEY;
  const DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID;

  const parseRow = (page) => {
    const props = page.properties || {};
    const titleArr = props["이름(상표/디자인)"]?.title || [];
    const title = titleArr.map((t) => t.plain_text).join("") || "(제목 없음)";

    const categoryItems = (props["카테고리"]?.multi_select || []).map((c) => ({
      name: c.name, color: c.color || "default"
    }));

    const docWorkRaw = props["서류작업상태(작업자)"]?.status || props["서류작업상태(작업자)"]?.select || null;
    const docWorkStatusItem = docWorkRaw ? { name: docWorkRaw.name, color: docWorkRaw.color || "default" } : null;

    const fileLinksRaw = props["파일다운링크"]?.rich_text?.map((t) => t.plain_text).join("") || "";
    const fileLinks = fileLinksRaw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^\((.+?)\)(https?:\/\/.+)$/);
        if (match) return { name: match[1], url: match[2] };
        return { name: decodeURIComponent(line.split("/").pop()), url: line };
      });

    const url = page.url || "";
    const pageId = page.id || "";

    return { title, categoryItems, docWorkStatusItem, fileLinks, url, pageId };
  };

  try {
    const response = await fetch(
      `https://api.notion.com/v1/data_sources/${DATA_SOURCE_ID}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_KEY}`,
          "Notion-Version": "2025-09-03",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: {
            property: "카테고리",
            multi_select: { contains: "문서 양식" },
          },
          sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
          page_size: 100,
        }),
      }
    );
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.message });
    return res.status(200).json({ results: (data.results || []).map(parseRow) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
