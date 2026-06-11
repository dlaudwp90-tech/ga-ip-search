// pages/api/kipris-image.js
// ─────────────────────────────────────────────────────────────────────────────
// 【KIPRIS 이미지 프록시】
//  - KIPRIS 이미지 URL은 http 라서, https 페이지(staff.markangel.co.kr)에서 <img>로 바로 넣으면
//    브라우저가 막습니다(mixed content). 이 라우트가 서버에서 받아 https로 다시 내보내 우회합니다.
//  - openapi 호출수(월 1,000)에 안 잡힙니다(이미지 파일 서버라 별개).
//  - 보안: KIPRIS 도메인(*.kipris.or.kr)만 허용 (아무 URL이나 대신 받아주지 않음).
//
//  사용:  /api/kipris-image?u=<KIPRIS 이미지 URL 인코딩>
// ─────────────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const u = req.query.u;
  if (!u) return res.status(400).end("missing u");

  let target;
  try { target = new URL(u); } catch { return res.status(400).end("bad url"); }

  // SSRF 방지: KIPRIS 이미지 도메인만 허용
  if (!/(^|\.)kipris\.or\.kr$/.test(target.hostname)) {
    return res.status(403).end("forbidden host");
  }

  try {
    const r = await fetch(target.toString());
    if (!r.ok) return res.status(502).end("upstream " + r.status);
    const ct = r.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=604800, immutable"); // 7일 캐시(이미지는 안 바뀜)
    return res.status(200).send(buf);
  } catch {
    return res.status(502).end("fetch failed");
  }
}
