// pages/api/review.js
// Upstash Redis REST API — Pipeline 방식 사용 (특수문자 키 안전 처리)
//
// 필요한 환경변수 (Vercel 환경변수에 추가):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

async function redisPipeline(url, token, commands) {
  const res = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upstash pipeline error ${res.status}: ${text}`);
  }
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
      // Pipeline으로 MGET 실행 — 특수문자 키도 body에서 안전하게 처리
      const data = await redisPipeline(redisUrl, redisToken, [["MGET", ...keys]]);
      const results = data?.[0]?.result ?? [];
      const states = {};
      urls.forEach((u, i) => { states[u] = results[i] ?? null; });
      return res.status(200).json({ states, kvAvailable: true });
    } catch (err) {
      console.error("Redis get error:", err.message);
      return res.status(200).json({ states: {}, kvAvailable: false, error: err.message });
    }
  }

  // ── 단일 상태 저장 ─────────────────────────────────────────────────────
  if (action === "set") {
    if (!url)         return res.status(400).json({ error: "url required" });
    if (!isAvailable) return res.status(200).json({ ok: false, kvAvailable: false });

    try {
      const key = `review:${url}`;
      let command;
      if (status === null || status === undefined || status === "") {
        command = ["DEL", key];
      } else {
        command = ["SET", key, status];
      }
      const data = await redisPipeline(redisUrl, redisToken, [command]);
      const result = data?.[0]?.result;
      // SET은 "OK" 반환, DEL은 삭제된 키 수(0 또는 1) 반환
      const ok = result === "OK" || typeof result === "number";
      return res.status(200).json({ ok, kvAvailable: true });
    } catch (err) {
      console.error("Redis set error:", err.message);
      return res.status(500).json({ ok: false, kvAvailable: true, error: err.message });
    }
  }

  return res.status(400).json({ error: "action must be 'get' or 'set'" });
}
