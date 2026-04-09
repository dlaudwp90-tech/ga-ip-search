// pages/api/comments.js
// Upstash Redis REST pipeline 방식 (review.js와 동일한 패턴)

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function pipeline(commands) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { action, pageId, nickname, content, commentId } = req.body || {};
  if (!pageId) return res.status(400).json({ error: "pageId required" });

  const listKey = `comments:${pageId}`;

  // ── 댓글 목록 조회
  if (action === "get") {
    const data = await pipeline([["LRANGE", listKey, "0", "-1"]]);
    const items = data?.[0]?.result || [];
    const comments = items.map(s => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean);
    return res.json({ comments });
  }

  // ── 댓글 작성
  if (action === "post") {
    if (!content) return res.status(400).json({ error: "content required" });
    const id = `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
    const comment = { id, nickname: nickname || "익명", content, createdAt: now, edited: false };
    await pipeline([["RPUSH", listKey, JSON.stringify(comment)]]);
    return res.json({ ok: true });
  }

  // ── 댓글 수정
  if (action === "update") {
    if (!commentId || !content) return res.status(400).json({ error: "commentId, content required" });
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

  // ── 댓글 삭제
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
