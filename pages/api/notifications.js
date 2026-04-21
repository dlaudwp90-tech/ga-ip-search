// pages/api/notifications.js
// 댓글 알림 관리 - Upstash Redis REST pipeline

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

const NOTIF_KEY = "notif_list";
const MAX_NOTIF = 100;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { action, email, notification } = req.body || {};

  // 알림 목록 조회 + 읽음 처리
  if (action === "get") {
    if (!email) return res.status(400).json({ error: "email required" });
    const readKey = `notif_read:${email}`;
    const data = await pipeline([
      ["LRANGE", NOTIF_KEY, "0", "49"],
      ["GET", readKey],
    ]);
    const items = (data?.[0]?.result || [])
      .map(s => { try { return JSON.parse(s); } catch { return null; } })
      .filter(Boolean);
    const lastRead = data?.[1]?.result || "0";
    return res.json({ notifications: items, lastRead });
  }

  // 읽음 처리
  if (action === "markRead") {
    if (!email) return res.status(400).json({ error: "email required" });
    const now = Date.now().toString();
    await pipeline([["SET", `notif_read:${email}`, now]]);
    return res.json({ ok: true });
  }

  // 알림 추가 (댓글 등록 시 호출)
  if (action === "add") {
    if (!notification) return res.status(400).json({ error: "notification required" });
    const data = await pipeline([
      ["LPUSH", NOTIF_KEY, JSON.stringify(notification)],
      ["LTRIM", NOTIF_KEY, "0", String(MAX_NOTIF - 1)],
    ]);
    return res.json({ ok: true });
  }

  return res.status(400).json({ error: "invalid action" });
}
