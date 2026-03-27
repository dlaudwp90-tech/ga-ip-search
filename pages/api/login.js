function getExpectedCode() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `gaip${year}${month}`;
}

function getEndOfMonthSeconds() {
  const now = new Date();
  // 다음 달 1일 00:00:00 - 현재 시각 = 이번 달 남은 초
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.floor((nextMonth - now) / 1000);
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
