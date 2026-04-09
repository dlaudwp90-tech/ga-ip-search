import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export default async function handler(req, res) {
  const { email, nickname } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });

  const key = `nickname:${email}`;

  if (req.method === "POST" && nickname) {
    await redis.set(key, nickname);
    return res.json({ ok: true });
  }

  const saved = await redis.get(key);
  return res.json({ nickname: saved || null });
}
