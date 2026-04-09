const NOTION_KEY = process.env.NOTION_API_KEY;

export default async function handler(req, res) {
  const { action, pageId, nickname, content } = req.body || {};

  // 댓글 목록 조회
  if (action === "get") {
    if (!pageId) return res.status(400).json({ error: "pageId required" });
    const r = await fetch(`https://api.notion.com/v1/comments?block_id=${pageId}`, {
      headers: {
        "Authorization": `Bearer ${NOTION_KEY}`,
        "Notion-Version": "2022-06-28",
      },
    });
    const data = await r.json();
    const comments = (data.results || []).map((c) => ({
      id: c.id,
      text: c.rich_text?.map((t) => t.plain_text).join("") || "",
      createdAt: c.created_time,
    }));
    return res.json({ comments });
  }

  // 댓글 작성
  if (action === "post") {
    if (!pageId || !content) return res.status(400).json({ error: "pageId, content required" });
    const nick = nickname || "익명";
    const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
    const fullText = `[${nick}] ${now}\n${content}`;

    const r = await fetch("https://api.notion.com/v1/comments", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${NOTION_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { page_id: pageId },
        rich_text: [{ text: { content: fullText } }],
      }),
    });
    const data = await r.json();
    if (data.object === "error") return res.status(500).json({ error: data.message });
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: "invalid action" });
}
