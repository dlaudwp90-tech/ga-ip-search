// pages/api/comments.js
// ─────────────────────────────────────────────────────────────────────────────
// 【댓글 — Supabase 버전 (Redis 완전 제거)】  ⚠ 수정 주의
//  - 댓글은 Supabase comments 표에 저장/조회/수정/삭제.
//  - 댓글 작성 시 "알림"도 Supabase notifications 표에 함께 기록(벨 기능 유지).
//    → 이제 이 파일은 Redis를 전혀 쓰지 않습니다.
//  - 화면이 주고받는 요청/응답 형식은 이전과 100% 동일 (화면 코드 손댈 필요 없음).
//
//  요청(POST):
//    { action:"get",    pageId }                            → { comments:[...] }
//    { action:"post",   pageId, nickname, content, docTitle } → { ok:true }
//    { action:"update", commentId, content }                → { ok:true }
//    { action:"delete", commentId }                         → { ok:true }
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
  const { action, pageId, nickname, content, commentId, docTitle } = req.body || {};

  try {
    // ── 조회 ──
    if (action === "get") {
      if (!pageId) return res.status(400).json({ error: "pageId required" });
      const enc = encodeURIComponent(pageId);
      const rows = (await sb(`comments?page_id=eq.${enc}&order=created_ts.asc&select=*`)) || [];
      const comments = rows.map(r => ({
        id: r.id,
        nickname: r.nickname,
        content: r.content,
        createdAt: r.created_at,
        edited: !!r.edited,
        ...(r.edited_at ? { editedAt: r.edited_at } : {}),
      }));
      return res.json({ comments });
    }

    // ── 등록 ──
    if (action === "post") {
      if (!pageId)  return res.status(400).json({ error: "pageId required" });
      if (!content) return res.status(400).json({ error: "content required" });
      const ts  = Date.now();
      const id  = `c_${ts}_${Math.random().toString(36).slice(2, 7)}`;
      const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });

      // 1) 댓글 → Supabase comments
      await sb("comments", {
        method: "POST",
        body: [{ id, page_id: pageId, nickname: nickname || "익명", content, created_at: now, created_ts: ts, edited: false }],
        prefer: "return=minimal",
      });

      // 2) 알림 → Supabase notifications (벨 기능 유지)
      try {
        await sb("notifications", {
          method: "POST",
          body: [{
            id: `n_${ts}`,
            nickname: nickname || "익명",
            doc_title: docTitle || "문서",
            page_id: pageId,
            content: content.slice(0, 50) + (content.length > 50 ? "..." : ""),
            created_at: now,
            ts,
          }],
          prefer: "return=minimal",
        });
      } catch {}

      return res.json({ ok: true });
    }

    // ── 수정 ──
    if (action === "update") {
      if (!commentId || !content) return res.status(400).json({ error: "required fields missing" });
      const enc = encodeURIComponent(commentId);
      const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul", hour12: false });
      const updated = await sb(`comments?id=eq.${enc}`, {
        method: "PATCH",
        body: { content, edited: true, edited_at: now },
        prefer: "return=representation",
      });
      if (!updated || updated.length === 0) return res.status(404).json({ error: "not found" });
      return res.json({ ok: true });
    }

    // ── 삭제 ──
    if (action === "delete") {
      if (!commentId) return res.status(400).json({ error: "commentId required" });
      const enc = encodeURIComponent(commentId);
      const deleted = await sb(`comments?id=eq.${enc}`, {
        method: "DELETE",
        prefer: "return=representation",
      });
      if (!deleted || deleted.length === 0) return res.status(404).json({ error: "not found" });
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: "invalid action" });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
