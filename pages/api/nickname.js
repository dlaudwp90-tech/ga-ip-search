// pages/api/nickname.js
// ─────────────────────────────────────────────────────────────────────────────
// 【닉네임 보관함】  ⚠ 수정 주의: 직원별 "표시 이름"을 저장/조회하는 백엔드입니다.
//
//  하는 일: 로그인한 직원(email 기준)마다 화면에 보일 닉네임을 Redis에 저장하고 불러옵니다.
//           시스템은 계정을 기계용 정보로 구분하므로, "누가 했는지"를 사람이 읽는
//           이름으로 보여줄 때(댓글·검토 등) 이 보관함을 씁니다.
//
//  ▷ 저장 키:   nickname:{email}
//  ▷ 요청(POST 본문):
//       { email, nickname }  → nickname 있으면 "저장",  없으면 "조회"
//  ▷ 응답:
//       저장 시  { ok: true }
//       조회 시  { nickname: "저장된 이름" 또는 null }
//
//  ★ Redis 통신 방식 = 파이프라인(POST /pipeline, 명령을 JSON 본문에 담아 전송) ★
//     - review / comments / notifications 등 다른 파일과 동일한 방식으로 통일했습니다.
//     - 키·값을 URL이 아니라 "본문(JSON 봉투)"에 담으므로 어떤 문자가 들어가도 안전합니다.
//     - 저장 키와 동작은 이전과 100% 동일 — 닉네임 기능은 그대로 작동합니다.
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

  const { email, nickname } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });

  const key = `nickname:${email}`;  // 직원별 보관 키

  try {
    // nickname 값이 함께 오면 "저장 모드", 없으면 "조회 모드"
    if (nickname) {
      await redisSet(key, nickname);
      return res.json({ ok: true });
    }
    const saved = await redisGet(key);
    return res.json({ nickname: saved });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
