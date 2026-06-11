// pages/api/kipris-trademark-image.js
// ─────────────────────────────────────────────────────────────────────────────
// 【상표 고해상도 이미지(견본이미지) 조회】
//  - 목록 API가 주는 대표이미지는 저해상도라 크게 띄우면 흐릿함 → 이 API의 큰이미지(path)를 사용.
//  - 오퍼레이션: trademarkInfoSearchService / getSampleImageInfoSearch
//      · 베이스/인증이 특이: /kipo-api/kipi/ + ServiceKey  (다른 서비스는 /openapi/rest/ + accessKey)
//      · 키가 어느 쪽에 먹는지 확실치 않아 kipo-api 먼저 → 실패 시 openapi/rest 폴백
//  - 응답: item 1개 안에  path(큰이미지경로=고해상도)  +  smallPath(작은경로)
//  - ★ 호출 최소화: 결과를 Redis(tm-img:<출원번호>)에 캐시 → 같은 상표 재조회 시 KIPRIS 0회 ★
//    (이미지 표시는 /api/kipris-image 프록시 경유)
//
//  사용:  /api/kipris-trademark-image?app=<출원번호>   → { large, small }
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
  if (!/^\d{10,13}$/.test(app)) return res.status(400).json({ error: "bad app", large: "", small: "" });

  const KEY = process.env.KIPRIS_ACCESS_KEY;
  const R_URL = process.env.UPSTASH_REDIS_REST_URL;
  const R_TOK = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!KEY) return res.status(500).json({ error: "no key", large: "", small: "" });

  const cacheKey = `tm-img:${app}`;

  // 1) 캐시 확인
  if (R_URL && R_TOK) {
    try {
      const j = await redis(R_URL, R_TOK, [["GET", cacheKey]]);
      const raw = j?.[0]?.result;
      if (raw) { const o = JSON.parse(raw); return res.status(200).json({ ...o, cached: true }); }
    } catch {}
  }

  // XML 단일 태그 추출
  const pick = (t, tag) => { const m = t.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`)); return m ? m[1].trim() : ""; };

  // 한 게이트웨이로 시도 → item 안의 path(큰)/smallPath(작은) 추출 + 응답코드 확인
  const tryFetch = async (base, keyParam) => {
    const url = `${base}/trademarkInfoSearchService/getSampleImageInfoSearch?applicationNumber=${app}&${keyParam}=${encodeURIComponent(KEY)}`;
    const xml = await (await fetch(url)).text();
    const code = (xml.match(/<resultCode>([\s\S]*?)<\/resultCode>/) || [])[1] || "";
    const item = (xml.match(/<item>([\s\S]*?)<\/item>/) || [])[1] || "";
    const large = pick(item, "path");      // 큰이미지경로(고해상도, fileToss URL)
    const small = pick(item, "smallPath"); // 작은경로
    return { img: large || small ? { large, small } : null, code };
  };

  try {
    let img = null, via = "", codes = {};
    try { const r = await tryFetch("http://plus.kipris.or.kr/kipo-api/kipi", "ServiceKey"); codes.kipo = r.code; if (r.img) { img = r.img; via = "kipo-api"; } }
    catch (e) { codes.kipo = "ERR:" + e.message; }
    if (!img) {
      try { const r = await tryFetch("http://plus.kipris.or.kr/openapi/rest", "accessKey"); codes.rest = r.code; if (r.img) { img = r.img; via = "openapi-rest"; } }
      catch (e) { codes.rest = "ERR:" + e.message; }
    }

    // 이미지가 있을 때만 캐시(인증 실패/일시오류로 빈 결과를 영구 캐시하지 않도록)
    if (img && R_URL && R_TOK) {
      try { await redis(R_URL, R_TOK, [["SET", cacheKey, JSON.stringify(img)]]); } catch {}
    }
    return res.status(200).json({ ...(img || { large: "", small: "" }), via, codes });
  } catch (e) {
    return res.status(502).json({ error: e.message, large: "", small: "" });
  }
}
