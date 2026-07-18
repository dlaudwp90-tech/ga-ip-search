// pages/api/notifications.js
// ─────────────────────────────────────────────────────────────────────────────
// 【댓글 알림 — Supabase 버전】  ⚠ 수정 주의
//  - 알림 목록은 Supabase notifications 표에, "읽음 시각"은 profiles.notif_last_read 에 저장.
//  - 저장 위치만 Redis → Supabase로 바뀌었고, 요청/응답 형식은 이전과 100% 동일합니다.
//
//  요청(POST):
//    { action:"get",      email }               → { notifications:[...], lastRead:"<ms>" }
//    { action:"markRead", email }               → { ok:true }
//    { action:"add",      notification }         → { ok:true }
//
//  필요한 환경변수: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
// ─────────────────────────────────────────────────────────────────────────────

const SB_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  const { action, email, notification } = req.body || {};

  try {
    // ── 목록 조회 + 읽음시각 ──
    if (action === "get") {
      if (!email) return res.status(400).json({ error: "email required" });
      const enc = encodeURIComponent(email);
      // 최근 50개 (ts 내림차순)
      const rows = (await sb(`notifications?order=ts.desc&limit=50&select=*`)) || [];
      const notifications = rows.map(r => ({
        id: r.id, nickname: r.nickname, docTitle: r.doc_title,
        pageId: r.page_id, content: r.content, createdAt: r.created_at, ts: r.ts,
      }));
      // 사용자 읽음시각
      const prof = await sb(`profiles?email=eq.${enc}&select=notif_last_read`);
      const lastRead = prof && prof[0] && prof[0].notif_last_read != null ? String(prof[0].notif_last_read) : "0";
      return res.json({ notifications, lastRead });
    }

    // ── 읽음 처리 ──
    if (action === "markRead") {
      if (!email) return res.status(400).json({ error: "email required" });
      await sb("profiles?on_conflict=email", {
        method: "POST",
        body: [{ email, notif_last_read: Date.now() }],
        prefer: "resolution=merge-duplicates,return=minimal",
      });
      return res.json({ ok: true });
    }

    // ── 알림 추가 ──
    if (action === "add") {
      if (!notification) return res.status(400).json({ error: "notification required" });
      await sb("notifications", {
        method: "POST",
        body: [{
          id: notification.id,
          nickname: notification.nickname || "익명",
          doc_title: notification.docTitle || "문서",
          page_id: notification.pageId || "",
          content: notification.content || "",
          created_at: notification.createdAt || "",
          ts: notification.ts || Date.now(),
        }],
        prefer: "return=minimal",
      });
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: "invalid action" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
