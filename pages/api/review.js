// page/api/review.js
// Upstash Redis 기반 대표 검토 상태 저장/조회
//
// 필요한 환경변수 (Vercel Storage → Upstash Redis 연결 시 자동 설정):
//   UPSTASH_REDIS_REST_URL
//   UPSTASH_REDIS_REST_TOKEN

import { Redis } from "@upstash/redis";

function getRedis() {
  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { action, url, status, urls } = req.body;
  const redis      = getRedis();
  const isAvailable = !!redis;

  // ── 상태 일괄 조회 ─────────────────────────────────────────────────────
  if (action === "get") {
    if (!urls?.length) return res.status(200).json({ states: {}, kvAvailable: isAvailable });
    if (!redis)        return res.status(200).json({ states: {}, kvAvailable: false });

    try {
      const keys   = urls.map(u => `review:${u}`);
      const values = await redis.mget(...keys);
      const states = {};
      urls.forEach((u, i) => { states[u] = values[i] ?? null; });
      return res.status(200).json({ states, kvAvailable: true });
    } catch (err) {
      console.error("Redis mget error:", err);
      return res.status(200).json({ states: {}, kvAvailable: false });
    }
  }

  // ── 단일 상태 저장 ─────────────────────────────────────────────────────
  if (action === "set") {
    if (!url)    return res.status(400).json({ error: "url required" });
    if (!redis)  return res.status(200).json({ ok: false, kvAvailable: false });

    try {
      const key = `review:${url}`;
      if (status === null || status === undefined || status === "") {
        await redis.del(key);
      } else {
        await redis.set(key, status);
      }
      return res.status(200).json({ ok: true, kvAvailable: true });
    } catch (err) {
      console.error("Redis set error:", err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  return res.status(400).json({ error: "action must be 'get' or 'set'" });
}
