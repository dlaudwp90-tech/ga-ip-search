import { serialize } from "cookie";

export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { code } = req.body;
  if (code !== process.env.ACCESS_CODE) {
    return res.status(401).json({ error: "Invalid code" });
  }
  res.setHeader("Set-Cookie", serialize("ga_access", code, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30일 유지
    path: "/",
  }));
  res.status(200).json({ ok: true });
}
