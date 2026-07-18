// pages/api/migrate-renewals.js
// ─────────────────────────────────────────────────────────────────────────────
// 【1회용】 Redis 연차캐시(renewals:data/meta) → Supabase app_cache 복사   ⚠ 끝나면 삭제
//  - KIPRIS 재조회 없이 이미 계산된 캐시를 그대로 옮깁니다.
//  실행: https://staff.markangel.co.kr/api/migrate-renewals?secret=ga-sync-2026
//  필요한 환경변수: UPSTASH_REDIS_REST_URL/_TOKEN (읽기) · SUPABASE_URL/SERVICE_ROLE_KEY (쓰기)
// ─────────────────────────────────────────────────────────────────────────────

const R_URL  = process.env.UPSTASH_REDIS_REST_URL;
const R_TOK  = process.env.UPSTASH_REDIS_REST_TOKEN;
const SB_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function redis(commands) {
  const r = await fetch(`${R_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${R_TOK}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`Redis ${r.status}: ${await r.text()}`);
  return r.json();
}
async function sb(pathq, { method = "GET", body, prefer } = {}) {
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SB_URL}/rest/v1/${pathq}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  const t = await r.text(); return t ? JSON.parse(t) : null;
}

export default async function handler(req, res) {
  const SECRET = process.env.KIPRIS_SYNC_SECRET || "ga-sync-2026";
  if ((req.query.secret || "") !== SECRET) return res.status(401).json({ error: "Unauthorized" });
  if (!R_URL || !R_TOK) return res.status(500).json({ error: "Redis 환경변수 미설정" });
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: "Supabase 환경변수 미설정" });

  try {
    const r = await redis([["GET", "renewals:data"], ["GET", "renewals:meta"]]);
    const dataRaw = r?.[0]?.result;
    const metaRaw = r?.[1]?.result;
    const data = dataRaw ? JSON.parse(dataRaw) : [];
    const meta = metaRaw ? JSON.parse(metaRaw) : null;

    await sb("app_cache?on_conflict=key", {
      method: "POST",
      body: [
        { key: "renewals_data", value: data, updated_at: new Date().toISOString() },
        { key: "renewals_meta", value: meta, updated_at: new Date().toISOString() },
      ],
      prefer: "resolution=merge-duplicates,return=minimal",
    });

    return res.status(200).json({
      ok: true,
      copiedRecords: Array.isArray(data) ? data.length : 0,
      hasMeta: !!meta,
      hint: "Supabase app_cache 확인 → renewals/daily-sync 배포 → 이 파일 삭제.",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
