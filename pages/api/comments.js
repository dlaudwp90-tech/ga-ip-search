// pages/api/comments.js
// Redis REST API로 댓글 저장 (수정/삭제 완벽 지원)

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCmd(...args) {
  const res = await fetch(`${REDIS_URL}/${args.map(a => encodeURIComponent(a)).join("/")}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  return res.json();
}

async function redisCmdBody(method, path, body) {
  const res = await fetch(`${REDIS_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { action, pageId, nickname, content, commentId } = req.body || {};

  const listKey = `comments:${pageId}`;

  // 댓글 목록 조회
  if (action === "get") {
    if (!pageId) return res.status(400).json({ error: "pageId required" });
    const result = await redisCmd("lrange", listKey, "0", "-1");
    const comments = (result.result || []).map(s => {
      try { return JSON.parse(s); } catch { return null; }
    }).filter(Boolean);
    return res.json({ comments });
  }

  // 댓글 작성
  if (action === "post") {
    if (!pageId || !content) return res.status(400).json({ error: "pageId, content required" });
    const id = `c_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
    const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
    const comment = { id, nickname: nickname || "익명", content, createdAt: now, edited: false };
    await redisCmdBody("POST", "/rpush", [listKey, JSON.stringify(comment)]);
    return res.json({ ok: true });
  }

  // 댓글 수정
  if (action === "update") {
    if (!pageId || !commentId || !content) return res.status(400).json({ error: "required fields missing" });
    const result = await redisCmd("lrange", listKey, "0", "-1");
    const items = (result.result || []);
    const idx = items.findIndex(s => { try { return JSON.parse(s).id === commentId; } catch { return false; } });
    if (idx === -1) return res.status(404).json({ error: "comment not found" });
    const old = JSON.parse(items[idx]);
    const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
    const updated = { ...old, content, editedAt: now, edited: true };
    await redisCmdBody("POST", "/lset", [listKey, idx, JSON.stringify(updated)]);
    return res.json({ ok: true });
  }

  // 댓글 삭제
  if (action === "delete") {
    if (!pageId || !commentId) return res.status(400).json({ error: "pageId, commentId required" });
    const result = await redisCmd("lrange", listKey, "0", "-1");
    const items = (result.result || []);
    const target = items.find(s => { try { return JSON.parse(s).id === commentId; } catch { return false; } });
    if (!target) return res.status(404).json({ error: "comment not found" });
    // LREM으로 해당 항목 제거
    await redisCmdBody("POST", "/lrem", [listKey, "1", target]);
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: "invalid action" });
}
