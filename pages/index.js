// pages/api/nickname.js
// Upstash Redis REST API 직접 사용 (@upstash/redis 패키지 불필요)

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisGet(key) {
  const res = await fetch(`${REDIS_URL}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  return data.result || null;
}

async function redisSet(key, value) {
  await fetch(`${REDIS_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { email, nickname } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });

  const key = `nickname:${email}`;

  if (nickname) {
    await redisSet(key, nickname);
    return res.json({ ok: true });
  }

  const saved = await redisGet(key);
  return res.json({ nickname: saved });
}
