export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { code } = req.body;
  if (code !== process.env.ACCESS_CODE) {
    return res.status(401).json({ error: "Invalid code" });
  }

  const cookieValue = `ga_access=${code}; HttpOnly; Secure; SameSite=Lax; Max-Age=${60 * 60 * 24 * 30}; Path=/`;
  res.setHeader("Set-Cookie", cookieValue);
  res.status(200).json({ ok: true });
}
