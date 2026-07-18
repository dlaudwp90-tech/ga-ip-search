// pages/api/migrate-to-supabase.js
// ─────────────────────────────────────────────────────────────────────────────
// 【1회용 이전 스크립트】 Redis → Supabase 데이터 복사   ⚠ 이전 끝나면 삭제하세요
//
//  하는 일: Redis의 닉네임(nickname:*) · 설정(prefs:*) · 댓글(comments:*)을 읽어
//           Supabase의 profiles / comments 표로 복사합니다.
//  ★ 여러 번 실행해도 안전(같은 이메일/댓글id는 덮어쓰기 → 중복 안 생김) ★
//
//  실행 방법: 브라우저 주소창에 아래 접속 (한 번만)
//    https://staff.markangel.co.kr/api/migrate-to-supabase?secret=ga-sync-2026
//    → { ok:true, profiles:N, comments:M } 가 뜨면 성공
//
//  필요한 환경변수:
//    UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   (읽기)
//    SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY            (쓰기)
//    KIPRIS_SYNC_SECRET (기본 ga-sync-2026)              (무단실행 방지)
// ─────────────────────────────────────────────────────────────────────────────

export const config = { maxDuration: 60 };

const R_URL  = process.env.UPSTASH_REDIS_REST_URL;
const R_TOK  = process.env.UPSTASH_REDIS_REST_TOKEN;
const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Redis 파이프라인 호출
async function redis(commands) {
  const r = await fetch(`${R_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${R_TOK}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`Redis ${r.status}: ${await r.text()}`);
  return r.json();
}

// Supabase REST 호출
async function sb(path, { method = "GET", body, prefer } = {}) {
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

export default async function handler(req, res) {
  const SECRET = process.env.KIPRIS_SYNC_SECRET || "ga-sync-2026";
  if ((req.query.secret || "") !== SECRET) return res.status(401).json({ error: "Unauthorized" });
  if (!R_URL || !R_TOK) return res.status(500).json({ error: "Redis 환경변수 미설정" });
  if (!SB_URL || !SB_KEY) return res.status(500).json({ error: "Supabase 환경변수 미설정 (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });

  try {
    // ── 1) Redis 키 목록 ──
    const keyRes = await redis([
      ["KEYS", "nickname:*"],
      ["KEYS", "prefs:*"],
      ["KEYS", "comments:*"],
    ]);
    const nickKeys = keyRes?.[0]?.result || [];
    const prefKeys = keyRes?.[1]?.result || [];
    const cmtKeys  = keyRes?.[2]?.result || [];

    // ── 2) 값 한 번에 가져오기 ──
    const valCommands = [
      ...nickKeys.map(k => ["GET", k]),
      ...prefKeys.map(k => ["GET", k]),
      ...cmtKeys.map(k => ["LRANGE", k, "0", "-1"]),
    ];
    const valRes = valCommands.length ? await redis(valCommands) : [];

    let idx = 0;
    const nickVals = nickKeys.map(() => valRes[idx++]?.result);
    const prefVals = prefKeys.map(() => valRes[idx++]?.result);
    const cmtVals  = cmtKeys.map(() => valRes[idx++]?.result || []);

    // ── 3) profiles 행 구성 (email 기준으로 닉네임+설정 합치기) ──
    const profileMap = new Map();
    const getP = (email) => {
      if (!profileMap.has(email)) profileMap.set(email, { email, nickname: null, dark: false, tab_view: "auto" });
      return profileMap.get(email);
    };
    nickKeys.forEach((k, i) => {
      const email = k.slice("nickname:".length);
      if (email) getP(email).nickname = nickVals[i] ?? null;
    });
    prefKeys.forEach((k, i) => {
      const email = k.slice("prefs:".length);
      if (!email) return;
      let obj = {}; try { obj = JSON.parse(prefVals[i] || "{}"); } catch { obj = {}; }
      const p = getP(email);
      if (typeof obj.dark === "boolean")    p.dark = obj.dark;
      if (typeof obj.tabView === "string")  p.tab_view = obj.tabView;
    });
    const profiles = [...profileMap.values()].map(p => ({ ...p, updated_at: new Date().toISOString() }));

    // ── 4) comments 행 구성 ──
    const comments = [];
    cmtKeys.forEach((k, i) => {
      const pageId = k.slice("comments:".length);
      for (const s of (cmtVals[i] || [])) {
        let c; try { c = JSON.parse(s); } catch { continue; }
        if (!c || !c.id) continue;
        // id 형식 c_<ts>_<rand> 에서 정렬용 시각(ts) 추출
        let ts = 0; const m = String(c.id).match(/^c_(\d+)_/); if (m) ts = parseInt(m[1], 10);
        comments.push({
          id: c.id,
          page_id: pageId,
          nickname: c.nickname || "익명",
          content: c.content || "",
          created_at: c.createdAt || "",
          created_ts: ts,
          edited: !!c.edited,
          edited_at: c.editedAt || null,
        });
      }
    });

    // ── 5) Supabase upsert (중복 안전) ──
    if (profiles.length) {
      await sb("profiles?on_conflict=email", { method: "POST", body: profiles, prefer: "resolution=merge-duplicates,return=minimal" });
    }
    let cmtInserted = 0;
    for (let j = 0; j < comments.length; j += 100) {
      const chunk = comments.slice(j, j + 100);
      await sb("comments?on_conflict=id", { method: "POST", body: chunk, prefer: "resolution=merge-duplicates,return=minimal" });
      cmtInserted += chunk.length;
    }

    return res.status(200).json({
      ok: true,
      profiles: profiles.length,
      comments: cmtInserted,
      commentPages: cmtKeys.length,
      hint: "Supabase Table Editor에서 profiles/comments 확인 → 새 파일 3개 배포 → 그다음 이 파일 삭제.",
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
