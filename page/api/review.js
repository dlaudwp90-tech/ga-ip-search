// page/api/review.js
// Upstash Redis REST API 직접 호출 (npm 패키지 없음, fetch만 사용)
//
// 필요한 환경변수:
//   UPSTASH_REDIS_REST_URL   (예: https://xxx-xxx.upstash.io)
//   UPSTASH_REDIS_REST_TOKEN (예: AXxxxx...)
//
// Upstash 대시보드 → 생성한 DB → Details 탭에서 확인 가능
// Vercel Storage를 통해 연결했다면 자동으로 환경변수가 설정됨

const getConfig = () => ({
  url:   process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Upstash Redis REST pipeline API 호출
// commands 예시: [["GET","key1"],["GET","key2"],["SET","key","val"],["DEL","key"]]
async function redisPipeline(commands) {
  const { url, token } = getConfig();
  if (!url || !token) return null;
  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    if (!res.ok) return null;
    return await res.json(); // [{ result: value }, ...]
  } catch (err) {
    console.error("Upstash pipeline error:", err);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { action, url, status, urls } = req.body;
  const { url: redisUrl, token } = getConfig();
  const isAvailable = !!(redisUrl && token);

  // ── 상태 일괄 조회 (GET) ────────────────────────────────────────────────
  if (action === "get") {
    if (!urls?.length) {
      return res.status(200).json({ states: {}, kvAvailable: isAvailable });
    }
    if (!isAvailable) {
      return res.status(200).json({ states: {}, kvAvailable: false });
    }

    const commands = urls.map(u => ["GET", `review:${u}`]);
    const results  = await redisPipeline(commands);

    if (!results) {
      return res.status(200).json({ states: {}, kvAvailable: false });
    }

    const states = {};
    urls.forEach((u, i) => {
      states[u] = results[i]?.result ?? null;
    });
    return res.status(200).json({ states, kvAvailable: true });
  }

  // ── 단일 상태 저장 (SET / DEL) ──────────────────────────────────────────
  if (action === "set") {
    if (!url) return res.status(400).json({ error: "url required" });
    if (!isAvailable) {
      return res.status(200).json({ ok: false, kvAvailable: false });
    }

    const isEmpty = status === null || status === undefined || status === "";
    const command = isEmpty
      ? [["DEL", `review:${url}`]]
      : [["SET", `review:${url}`, String(status)]];

    const result = await redisPipeline(command);
    const ok     = Array.isArray(result) && result[0]?.result !== undefined;

    return res.status(200).json({ ok, kvAvailable: ok });
  }

  return res.status(400).json({ error: "action must be 'get' or 'set'" });
}
