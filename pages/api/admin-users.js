// pages/api/admin-users.js
// ─────────────────────────────────────────────────────────────────────────────
// 【관리자 전용 API — 목록 / 승인 / 거부(삭제) / 관리자 승급·해제】 ⚠ 권한 처리 코드
//  - 관리자만 호출 가능(호출자의 로그인 토큰을 검증). 관리자 = 최초관리자(ADMIN_EMAIL) 또는 is_admin.
//  - Supabase Admin API(service_role 키)로 사용자 관리.
//  - 승인여부: app_metadata.approved / 관리자여부: app_metadata.is_admin (둘 다 서버에서만 변경)
//  - 최초 관리자(ADMIN_EMAIL)는 강등·해제·삭제 불가(보호).
//
//  요청(POST, Authorization: Bearer <로그인 토큰>):
//    { action:"list" }                     → { users:[{id,email,approved,isAdmin,isSuper,emailConfirmed,createdAt}] }
//    { action:"approve",     userId }      → 승인
//    { action:"revoke",      userId }      → 승인 해제
//    { action:"reject",      userId }      → 거부(계정 삭제)
//    { action:"makeAdmin",   userId }      → 관리자 승급(+자동 승인)
//    { action:"removeAdmin", userId }      → 관리자 해제
//
//  필요한 환경변수: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";

const ADMIN_EMAIL = "dlaudwp90@gmail.com"; // 최초(슈퍼) 관리자 — 항상 관리자·승인, 강등/삭제 불가

const SB_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(SB_URL, SB_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

// 관리자 판별
const isAdminUser = (u) => !!u && (u.email === ADMIN_EMAIL || u.app_metadata?.is_admin === true);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    // ── 호출자 신원·권한 확인 ──
    const token = (req.headers.authorization || "").replace("Bearer ", "").trim();
    if (!token) return res.status(401).json({ error: "no token" });
    const { data: { user }, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !user) return res.status(401).json({ error: "invalid token" });
    if (!isAdminUser(user)) return res.status(403).json({ error: "forbidden" });

    const { action, userId } = req.body || {};

    // ── 목록 ──
    if (action === "list") {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (error) return res.status(500).json({ error: error.message });
      const users = (data?.users || []).map(u => ({
        id: u.id,
        email: u.email,
        approved: u.app_metadata?.approved === true || isAdminUser(u),
        isAdmin: isAdminUser(u),
        isSuper: u.email === ADMIN_EMAIL,
        emailConfirmed: !!u.email_confirmed_at,
        createdAt: u.created_at,
      }));
      return res.status(200).json({ users });
    }

    // ── 이후 액션: 대상 userId 필요 ──
    if (!userId) return res.status(400).json({ error: "userId required" });

    // 대상 조회 (기존 app_metadata 보존 위해)
    const { data: tgtWrap, error: gErr } = await admin.auth.admin.getUserById(userId);
    const target = tgtWrap?.user;
    if (gErr || !target) return res.status(404).json({ error: "user not found" });
    const meta = target.app_metadata || {};
    const targetIsSuper = target.email === ADMIN_EMAIL;

    // 기존 메타 + 변경분 병합해서 저장(다른 플래그 유실 방지)
    const setMeta = async (patch) => {
      const { error } = await admin.auth.admin.updateUserById(userId, { app_metadata: { ...meta, ...patch } });
      if (error) throw new Error(error.message);
    };

    if (action === "approve")   { await setMeta({ approved: true });  return res.json({ ok: true }); }

    if (action === "revoke") {
      if (targetIsSuper) return res.status(400).json({ error: "최초 관리자는 해제할 수 없습니다." });
      await setMeta({ approved: false }); return res.json({ ok: true });
    }

    if (action === "makeAdmin") { await setMeta({ is_admin: true, approved: true }); return res.json({ ok: true }); }

    if (action === "removeAdmin") {
      if (targetIsSuper) return res.status(400).json({ error: "최초 관리자는 강등할 수 없습니다." });
      await setMeta({ is_admin: false }); return res.json({ ok: true });
    }

    if (action === "reject") { // 거부 = 계정 삭제
      if (targetIsSuper) return res.status(400).json({ error: "최초 관리자는 삭제할 수 없습니다." });
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: "invalid action" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
