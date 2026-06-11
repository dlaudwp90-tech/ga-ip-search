// pages/api/preferences.js
// ─────────────────────────────────────────────────────────────────────────────
// 【개인 화면설정 보관함】  ⚠ 수정 주의: 직원별 UI 설정을 저장/조회하는 백엔드입니다.
//
//  하는 일: 로그인한 직원(email 기준)마다 본인 화면 취향을 Redis에 저장하고 불러옵니다.
//           담는 값: 다크모드(dark), 탭뷰(tabView: auto/mobile/pc) 등.
//           재접속했을 때 본인이 켜뒀던 상태로 화면을 복원하는 데 사용합니다.
//           (이게 없으면 새로고침할 때마다 설정이 초기화됨)
//
//  ▷ 저장 키:   prefs:{email}   (값은 JSON 문자열로 보관)
//  ▷ 요청(POST 본문):
//       { email, prefs }  → prefs(객체) 있으면 "저장",  없으면 "조회"
//  ▷ 응답:
//       저장 시  { ok: true }
//       조회 시  { prefs: {...} 또는 null }
//
//  ★ Redis 통신 방식 = 파이프라인(POST /pipeline, 명령을 JSON 본문에 담아 전송) ★
//     - 다른 파일과 동일한 방식으로 통일했습니다.
//     - 설정값(JSON)을 URL이 아닌 "본문(JSON 봉투)"에 실으므로 길고 복잡한 값도 안전합니다.
//     - 저장 키와 동작은 이전과 100% 동일 — 설정 저장/복원은 그대로 작동합니다.
//
//  필요한 환경변수: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN
// ─────────────────────────────────────────────────────────────────────────────

const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

// ── Redis 파이프라인 호출 ──
//    commands 예시:  [["GET", "키"]]   또는   [["SET", "키", "값"]]
//    응답은 명령마다 { result: ... } 가 담긴 배열로 옴 → 첫 명령 결과는 r[0].result
async function redisPipeline(commands) {
  const res = await fetch(`${REDIS_URL}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Upstash ${res.status}`);
  return res.json();
}

// 값 조회 (키가 없으면 null)
async function redisGet(key) {
  const r = await redisPipeline([["GET", key]]);
  return r?.[0]?.result || null;
}

// 값 저장
async function redisSet(key, value) {
  await redisPipeline([["SET", key, value]]);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { email, prefs } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });

  const key = `prefs:${email}`;  // 직원별 설정 키

  try {
    // prefs(객체)가 함께 오면 "저장 모드"
    if (prefs && typeof prefs === "object") {
      await redisSet(key, JSON.stringify(prefs));  // 객체 → JSON 문자열로 보관
      return res.json({ ok: true });
    }

    // prefs 없으면 "조회 모드" → 저장된 JSON 문자열을 객체로 복원
    const saved = await redisGet(key);
    let parsed = null;
    if (saved) {
      try { parsed = JSON.parse(saved); } catch { parsed = null; }
    }
    return res.json({ prefs: parsed });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
