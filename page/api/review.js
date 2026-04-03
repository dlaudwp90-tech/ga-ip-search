// page/api/review.js
// Upstash Redis REST API (fetch 직접 호출) — @upstash/redis 패키지 불필요
//
// 필요한 환경변수 (Vercel 환경변수에 수동 추가):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

async function redisRequest(url, token, method, path, body) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { action, url, status, urls } = req.body;

  const redisUrl   = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const isAvailable = !!(redisUrl && redisToken);

  // ── 상태 일괄 조회 ─────────────────────────────────────────────────────
  if (action === "get") {
    if (!urls?.length) return res.status(200).json({ states: {}, kvAvailable: isAvailable });
    if (!isAvailable)  return res.status(200).json({ states: {}, kvAvailable: false });

    try {
      const keys = urls.map((u) => `review:${u}`);
      // Upstash REST MGET: POST /mget  body: ["key1","key2",...]
      const data = await redisRequest(redisUrl, redisToken, "POST", "/mget", keys);
      const states = {};
      urls.forEach((u, i) => { states[u] = data.result?.[i] ?? null; });
      return res.status(200).json({ states, kvAvailable: true });
    } catch (err) {
      console.error("Redis mget error:", err);
      return res.status(200).json({ states: {}, kvAvailable: false });
    }
  }

  // ── 단일 상태 저장 ─────────────────────────────────────────────────────
  if (action === "set") {
    if (!url)          return res.status(400).json({ error: "url required" });
    if (!isAvailable)  return res.status(200).json({ ok: false, kvAvailable: false });

    try {
      const key = `review:${url}`;
      if (status === null || status === undefined || status === "") {
        // DEL
        await redisRequest(redisUrl, redisToken, "POST", "/del", [key]);
      } else {
        // SET: POST /set/key/value
        await redisRequest(redisUrl, redisToken, "POST", `/set/${encodeURIComponent(key)}/${encodeURIComponent(status)}`, null);
      }
      return res.status(200).json({ ok: true, kvAvailable: true });
    } catch (err) {
      console.error("Redis set error:", err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  return res.status(400).json({ error: "action must be 'get' or 'set'" });
}
