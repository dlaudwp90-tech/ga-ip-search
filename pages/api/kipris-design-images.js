// pages/api/kipris-design-images.js
// ─────────────────────────────────────────────────────────────────────────────
// 【디자인 육면도 조회】
//  - 출원번호(applicationNumber)로 한 디자인의 모든 도면(사시도·정면도·측면도 등) 이미지 경로를 가져옵니다.
//  - 오퍼레이션: designInfoSearchService / getSixImageInfoSearch
//      · 베이스/인증이 특이: /kipo-api/kipi/ + ServiceKey  (다른 서비스는 /openapi/rest/ + accessKey)
//      · 키가 어느 쪽에 먹는지 확실치 않아 kipo-api 먼저 → 실패 시 openapi/rest 폴백
//  - ★ 호출 최소화: 결과를 Redis(design-imgs:<출원번호>)에 캐시 → 같은 디자인 재조회 시 KIPRIS 0회 ★
//    (이미지 표시는 /api/kipris-image 프록시 경유)
//
//  사용:  /api/kipris-design-images?app=<출원번호>   → { images: [{large, small, name, number}, ...] }
// ─────────────────────────────────────────────────────────────────────────────

async function redis(url, token, commands) {
  const r = await fetch(`${url}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error("redis " + r.status);
  return r.json();
}

export default async function handler(req, res) {
  const app = String(req.query.app || "").replace(/-/g, "");
  if (!/^\d{10,13}$/.test(app)) return res.status(400).json({ error: "bad app", images: [] });

  const KEY = process.env.KIPRIS_ACCESS_KEY;
  const R_URL = process.env.UPSTASH_REDIS_REST_URL;
  const R_TOK = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!KEY) return res.status(500).json({ error: "no key", images: [] });

  const cacheKey = `design-imgs:${app}`;

  // 1) 캐시 확인
  if (R_URL && R_TOK) {
    try {
      const j = await redis(R_URL, R_TOK, [["GET", cacheKey]]);
      const raw = j?.[0]?.result;
      if (raw) return res.status(200).json({ images: JSON.parse(raw), cached: true });
    } catch {}
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
    if (images.length && R_URL && R_TOK) {
      try { await redis(R_URL, R_TOK, [["SET", cacheKey, JSON.stringify(images)]]); } catch {}
    }
    return res.status(200).json({ images });
  } catch (e) {
    return res.status(502).json({ error: e.message, images: [] });
  }
}
