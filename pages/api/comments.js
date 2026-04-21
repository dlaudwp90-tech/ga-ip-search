// pages/api/comments.js
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function pipeline(commands) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { action, pageId, nickname, content, commentId, docTitle } = req.body || {};
  if (!pageId) return res.status(400).json({ error: "pageId required" });

  const listKey = `comments:${pageId}`;

  if (action === "get") {
    const data = await pipeline([["LRANGE", listKey, "0", "-1"]]);
    const comments = (data?.[0]?.result || [])
      .map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
    return res.json({ comments });
  }

  if (action === "post") {
    if (!content) return res.status(400).json({ error: "content required" });
    const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
    const comment = { id, nickname: nickname || "익명", content, createdAt: now, edited: false };

    // 알림 객체
    const notif = {
      id: `n_${Date.now()}`,
      nickname: nickname || "익명",
      docTitle: docTitle || "문서",
      pageId,
      content: content.slice(0, 50) + (content.length > 50 ? "..." : ""),
      createdAt: now,
      ts: Date.now(),
    };

    // 댓글 저장 + 알림 저장 동시에
    await pipeline([
      ["RPUSH", listKey, JSON.stringify(comment)],
      ["LPUSH", "notif_list", JSON.stringify(notif)],
      ["LTRIM", "notif_list", "0", "99"],
    ]);

    return res.json({ ok: true });
  }

  if (action === "update") {
    if (!commentId || !content) return res.status(400).json({ error: "required fields missing" });
    const data = await pipeline([["LRANGE", listKey, "0", "-1"]]);
    const items = data?.[0]?.result || [];
    const idx = items.findIndex(s => { try { return JSON.parse(s).id === commentId; } catch { return false; } });
    if (idx === -1) return res.status(404).json({ error: "not found" });
    const old = JSON.parse(items[idx]);
    const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
    const updated = { ...old, content, editedAt: now, edited: true };
    await pipeline([["LSET", listKey, idx, JSON.stringify(updated)]]);
    return res.json({ ok: true });
  }

  if (action === "delete") {
    if (!commentId) return res.status(400).json({ error: "commentId required" });
    const data = await pipeline([["LRANGE", listKey, "0", "-1"]]);
    const items = data?.[0]?.result || [];
    const target = items.find(s => { try { return JSON.parse(s).id === commentId; } catch { return false; } });
    if (!target) return res.status(404).json({ error: "not found" });
    await pipeline([["LREM", listKey, "1", target]]);
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: "invalid action" });
}
