export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { pageId } = req.query;
  if (!pageId) return res.status(400).json({ error: "pageId required" });

  const NOTION_KEY = process.env.NOTION_API_KEY;

  try {
    const response = await fetch(
      `https://api.notion.com/v1/blocks/${pageId}/children?page_size=100`,
      {
        headers: {
          Authorization: `Bearer ${NOTION_KEY}`,
          "Notion-Version": "2022-06-28",
        },
      }
    );
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.message });

    const blocks = (data.results || []).map((block) => {
      const type = block.type;
      const content = block[type] || {};
      const richText = content.rich_text || [];
      const text = richText.map((t) => t.plain_text).join("");

      let level = 0;
      if (type === "heading_1") level = 1;
      else if (type === "heading_2") level = 2;
      else if (type === "heading_3") level = 3;

      return {
        type,
        text,
        level,
        checked: content.checked || false,
      };
    }).filter((b) => b.text || b.type === "divider");

    return res.status(200).json({ blocks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
