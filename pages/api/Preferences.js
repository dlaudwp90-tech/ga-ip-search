// pages/api/preferences.js
// 사용자별 개인 설정(뷰타입, 다크모드, 탭뷰 등) 저장/로드
// key: prefs:{email}, value: JSON string

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
  const { email, prefs } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });

  const key = `prefs:${email}`;

  // 저장 (prefs가 객체로 전달된 경우)
  if (prefs && typeof prefs === "object") {
    try {
      await redisSet(key, JSON.stringify(prefs));
      return res.json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: "save failed" });
    }
  }

  // 조회 (prefs 없으면 읽기 모드)
  const saved = await redisGet(key);
  let parsed = null;
  if (saved) {
    try { parsed = JSON.parse(saved); } catch { parsed = null; }
  }
  return res.json({ prefs: parsed });
}
