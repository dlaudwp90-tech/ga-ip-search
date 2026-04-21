// KST(UTC+9) 기준으로 현재 연월 코드 반환
function getExpectedCode() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  return `gaip${year}${month}`;
}

// KST 기준 이번 달 말까지 남은 초
function getEndOfMonthSeconds() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // KST 다음 달 1일 00:00 → UTC로 변환
  const nextMonthKST_UTC = Date.UTC(
    kst.getUTCFullYear(),
    kst.getUTCMonth() + 1,
    1,
    0, 0, 0
  ) - 9 * 60 * 60 * 1000; // KST midnight → UTC
  return Math.floor((nextMonthKST_UTC - now.getTime()) / 1000);
}

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { code } = req.body;
  const expected = getExpectedCode();

  if (code !== expected) {
    return res.status(401).json({ error: "Invalid code" });
  }

  const maxAge = getEndOfMonthSeconds();
  const cookieValue = `ga_access=${code}; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}; Path=/`;
  res.setHeader("Set-Cookie", cookieValue);
  res.status(200).json({ ok: true });
}
