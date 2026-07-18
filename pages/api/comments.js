// pages/api/comments.js
// ─────────────────────────────────────────────────────────────────────────────
// 【댓글 — Supabase 버전】  ⚠ 수정 주의
//  - 댓글은 Supabase의 comments 표에 저장/조회/수정/삭제합니다.
//  - 댓글 작성 시 "알림"은 기존처럼 Redis(notif_list)에 남깁니다(벨 기능 유지).
//    → 그래서 이 파일만 Supabase + Redis 둘 다 사용합니다.
//  - 화면이 주고받는 요청/응답 형식은 이전과 100% 동일합니다 (화면 코드 손댈 필요 없음).
//
//  요청(POST):
//    { action:"get",    pageId }                          → { comments:[...] }
//    { action:"post",   pageId, nickname, content, docTitle } → { ok:true }
//    { action:"update", commentId, content }              → { ok:true }
//    { action:"delete", commentId }                       → { ok:true }
//
//  필요한 환경변수:
//    SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY            (댓글)
//    UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   (알림)
// ─────────────────────────────────────────────────────────────────────────────

// SUPABASE_URL 값에 끝슬래시·/rest/v1·공백이 섞여 들어와도 자동 정리 (PGRST125 방지)
const SB_URL = (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const R_URL  = process.env.UPSTASH_REDIS_REST_URL;
const R_TOK  = process.env.UPSTASH_REDIS_REST_TOKEN;

// Supabase REST 호출
async function sb(path, { method = "GET", body, prefer } = {}) {
  const headers = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json" };
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${await r.text()}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// Redis 파이프라인 (알림 저장 전용)
async function redis(commands) {
  const r = await fetch(`${R_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${R_TOK}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  return r.json();
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
      // 화면이 쓰던 형식 그대로 되돌려줌
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

      // 1) 댓글 → Supabase
      await sb("comments", {
        method: "POST",
        body: [{ id, page_id: pageId, nickname: nickname || "익명", content, created_at: now, created_ts: ts, edited: false }],
        prefer: "return=minimal",
      });

      // 2) 알림 → Redis (기존과 동일, 벨 기능 유지)
      if (R_URL && R_TOK) {
        const notif = {
          id: `n_${ts}`,
          nickname: nickname || "익명",
          docTitle: docTitle || "문서",
          pageId,
          content: content.slice(0, 50) + (content.length > 50 ? "..." : ""),
          createdAt: now,
          ts,
        };
        try {
          await redis([
            ["LPUSH", "notif_list", JSON.stringify(notif)],
            ["LTRIM", "notif_list", "0", "99"],
          ]);
        } catch {}
      }
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
