// /page/api/review.js
// Vercel KV 기반 대표 검토 상태 저장/조회
// 크로스 디바이스 공유 저장소
//
// 설정 방법:
//   Vercel 대시보드 → Storage → Create KV Database
//   프로젝트에 연결 → KV_REST_API_URL, KV_REST_API_TOKEN 환경변수 자동 설정
//
// KV Key 구조:
//   review:{pageUrl}  →  "confirmed" | "rejected" | "reviewing" | null

async function getKV() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  try {
    const { kv } = await import("@vercel/kv");
    return kv;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { action, url, status, urls } = req.body;
  const kv = await getKV();

  // ── 상태 일괄 조회 ─────────────────────────────────────────────────────
  if (action === "get") {
    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return res.status(200).json({ states: {}, kvAvailable: !!kv });
    }

    if (!kv) {
      // KV 미설정: 빈 상태 반환 (localStorage fallback 용)
      return res.status(200).json({ states: {}, kvAvailable: false });
    }

    try {
      const keys = urls.map(u => `review:${u}`);
      const values = await kv.mget(...keys);
      const states = {};
      urls.forEach((u, i) => { states[u] = values[i] ?? null; });
      return res.status(200).json({ states, kvAvailable: true });
    } catch (err) {
      console.error("KV get error:", err);
      return res.status(200).json({ states: {}, kvAvailable: false });
    }
  }

  // ── 단일 상태 저장 ─────────────────────────────────────────────────────
  if (action === "set") {
    if (!url) return res.status(400).json({ error: "url required" });

    if (!kv) {
      return res.status(200).json({ ok: false, kvAvailable: false,
        message: "Vercel KV가 설정되지 않았습니다. Vercel 대시보드에서 KV를 추가해주세요." });
    }

    try {
      const key = `review:${url}`;
      if (status === null || status === undefined || status === "") {
        await kv.del(key);
      } else {
        await kv.set(key, status);
      }
      return res.status(200).json({ ok: true, kvAvailable: true });
    } catch (err) {
      console.error("KV set error:", err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  }

  return res.status(400).json({ error: "action must be 'get' or 'set'" });
}
