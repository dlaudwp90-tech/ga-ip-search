// pages/api/preferences.js
// ─────────────────────────────────────────────────────────────────────────────
// 【개인 화면설정 보관함 — Supabase 버전】  ⚠ 수정 주의
//  - 직원별 다크모드/탭뷰를 Supabase의 profiles 표(email 기준)에 저장/조회합니다.
//  - 저장 위치만 Redis → Supabase로 바뀌었고, 요청/응답 형식은 이전과 100% 동일합니다.
//    화면은 여전히 { dark, tabView } 형태로 주고받습니다 (컬럼 dark / tab_view 로 매핑).
//
//  요청(POST): { email, prefs }  → prefs 있으면 저장, 없으면 조회
//  응답: 저장 { ok:true } / 조회 { prefs: { dark, tabView } 또는 null }
//
//  필요한 환경변수: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────

// SUPABASE_URL 값에 끝슬래시·/rest/v1·공백이 섞여 들어와도 자동 정리 (PGRST125 방지)
const SB_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Supabase REST 호출 (서버 전용 secret 키 사용 → RLS 통과)
async function sb(path, { method = "GET", body, prefer } = {}) {
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { email, prefs } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });
  const enc = encodeURIComponent(email);

  try {
    // prefs(객체)가 오면 "저장 모드" → dark / tab_view 컬럼으로 매핑해 upsert
    if (prefs && typeof prefs === "object") {
      const row = {
        email,
        dark:     typeof prefs.dark === "boolean" ? prefs.dark : false,
        tab_view: typeof prefs.tabView === "string" ? prefs.tabView : "auto",
        updated_at: new Date().toISOString(),
      };
      await sb("profiles?on_conflict=email", {
        method: "POST",
        body: [row],
        prefer: "resolution=merge-duplicates,return=minimal",
      });
      return res.json({ ok: true });
    }

    // 없으면 "조회 모드" → 화면이 쓰는 { dark, tabView } 형태로 복원
    const rows = await sb(`profiles?email=eq.${enc}&select=dark,tab_view`);
    if (rows && rows[0]) {
      return res.json({ prefs: { dark: !!rows[0].dark, tabView: rows[0].tab_view || "auto" } });
    }
    return res.json({ prefs: null });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
