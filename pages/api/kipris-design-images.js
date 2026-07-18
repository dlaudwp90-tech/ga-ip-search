// pages/api/kipris-design-images.js
// ─────────────────────────────────────────────────────────────────────────────
// 【디자인 육면도 조회】
//  - 출원번호(applicationNumber)로 한 디자인의 모든 도면(사시도·정면도·측면도 등) 이미지 경로를 가져옵니다.
//  - 오퍼레이션: designInfoSearchService / getSixImageInfoSearch
//      · 베이스/인증이 특이: /kipo-api/kipi/ + ServiceKey  (다른 서비스는 /openapi/rest/ + accessKey)
//      · 키가 어느 쪽에 먹는지 확실치 않아 kipo-api 먼저 → 실패 시 openapi/rest 폴백
//  - ★ 호출 최소화: 결과를 Supabase(app_cache)에 캐시 → 같은 디자인 재조회 시 KIPRIS 0회 ★
//    (이미지 표시는 /api/kipris-image 프록시 경유)
//
//  사용:  /api/kipris-design-images?app=<출원번호>   → { images: [{large, small, name, number}, ...] }
// ─────────────────────────────────────────────────────────────────────────────

// ── Supabase app_cache 헬퍼 (이미지 캐시 저장/조회) ──
const SB_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
async function cacheGet(key) {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/app_cache?key=eq.${encodeURIComponent(key)}&select=value`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j && j[0] ? j[0].value : null;   // jsonb → 이미 파싱된 값
  } catch { return null; }
}
async function cacheSet(key, value) {
  if (!SB_URL || !SB_KEY) return;
  try {
    await fetch(`${SB_URL}/rest/v1/app_cache?on_conflict=key`, {
      method: "POST",
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]),
    });
  } catch {}
}

export default async function handler(req, res) {
  const app = String(req.query.app || "").replace(/-/g, "");
  if (!/^\d{10,13}$/.test(app)) return res.status(400).json({ error: "bad app", images: [] });

  const KEY = process.env.KIPRIS_ACCESS_KEY;
  if (!KEY) return res.status(500).json({ error: "no key", images: [] });

  const cacheKey = `design_imgs_${app}`;

  // 1) 캐시 확인 (Supabase)
  {
    const cached = await cacheGet(cacheKey);
    if (Array.isArray(cached) && cached.length) return res.status(200).json({ images: cached, cached: true });
  }

  // XML 단일 태그 추출
  const pick = (t, tag) => { const m = t.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)); return m ? m[1].trim() : ""; };

  // 한 게이트웨이로 시도 → imagePath 그룹들을 파싱
  const tryFetch = async (base, keyParam) => {
    const url = `${base}/designInfoSearchService/getSixImageInfoSearch?applicationNumber=${app}&${keyParam}=${encodeURIComponent(KEY)}`;
    const xml = await (await fetch(url)).text();
    const blocks = [...xml.matchAll(/<imagePath>([\s\S]*?)<\/imagePath>/g)].map((m) => m[1]);
    return blocks
      .map((b) => ({ large: pick(b, "largePath"), small: pick(b, "smallPath"), name: pick(b, "imageName"), number: pick(b, "number") }))
      .filter((x) => x.large || x.small)
      .sort((a, b) => (parseInt(a.number || "0", 10) - parseInt(b.number || "0", 10)));
  };

  try {
    let images = [];
    try { images = await tryFetch("http://plus.kipris.or.kr/kipo-api/kipi", "ServiceKey"); } catch {}
    if (!images.length) {
      try { images = await tryFetch("http://plus.kipris.or.kr/openapi/rest", "accessKey"); } catch {}
    }

    // 이미지가 있을 때만 캐시(인증 실패/일시오류로 빈 결과를 영구 캐시하지 않도록)
    if (images.length) { await cacheSet(cacheKey, images); }
    return res.status(200).json({ images });
  } catch (e) {
    return res.status(502).json({ error: e.message, images: [] });
  }
}
