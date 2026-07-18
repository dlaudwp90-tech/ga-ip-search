// pages/api/migrate-images.js
// ─────────────────────────────────────────────────────────────────────────────
// 【1회용】 Redis 이미지 캐시 → Supabase app_cache 복사   ⚠ 끝나면 삭제
//  - design-imgs:<app>  → app_cache 키 design_imgs_<app>
//  - tm-img:<app>       → app_cache 키 tm_img_<app>
//  - KIPRIS 재조회 없이 이미 받아둔 이미지 캐시를 그대로 옮깁니다(육면도 다시 뜨게).
//
//  실행: https://staff.markangel.co.kr/api/migrate-images?secret=ga-sync-2026
//  필요한 환경변수: UPSTASH_REDIS_REST_URL/_TOKEN (읽기) · SUPABASE_URL/SERVICE_ROLE_KEY (쓰기)
// ─────────────────────────────────────────────────────────────────────────────

export const config = { maxDuration: 60 };

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
  if (!R_URL || !R_TOK) return res.status(500).json({ error: "Redis 환경변수 미설정(이미 지웠다면 임시로 다시 넣어주세요)" });
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: "Supabase 환경변수 미설정" });

  try {
    // 1) Redis 키 목록
    const keyRes = await redis([["KEYS", "design-imgs:*"], ["KEYS", "tm-img:*"]]);
    const dKeys = keyRes?.[0]?.result || [];
    const tKeys = keyRes?.[1]?.result || [];

    // 2) 값 한 번에
    const allKeys = [...dKeys, ...tKeys];
    const vals = allKeys.length ? await redis(allKeys.map(k => ["GET", k])) : [];

    // 3) app_cache 행 구성 (새 키 이름 + JSON 파싱해서 jsonb로)
    const rows = [];
    allKeys.forEach((k, i) => {
      const raw = vals[i]?.result;
      if (!raw) return;
      let value; try { value = JSON.parse(raw); } catch { return; }
      let newKey = null;
      if (k.startsWith("design-imgs:")) newKey = "design_imgs_" + k.slice("design-imgs:".length);
      else if (k.startsWith("tm-img:"))  newKey = "tm_img_" + k.slice("tm-img:".length);
      if (newKey) rows.push({ key: newKey, value, updated_at: new Date().toISOString() });
    });

    // 4) Supabase upsert (100개씩)
    let saved = 0;
    for (let j = 0; j < rows.length; j += 100) {
      const chunk = rows.slice(j, j + 100);
      await sb("app_cache?on_conflict=key", { method: "POST", body: chunk, prefer: "resolution=merge-duplicates,return=minimal" });
      saved += chunk.length;
    }

    return res.status(200).json({
      ok: true,
      designCaches: dKeys.length,
      trademarkCaches: tKeys.length,
      savedRows: saved,
      hint: "육면도/상표 이미지 다시 뜨는지 확인 → 정상이면 이 파일 삭제.",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
