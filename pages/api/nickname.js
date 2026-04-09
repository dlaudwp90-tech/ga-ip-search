const NOTION_KEY = process.env.NOTION_API_KEY;
const STAFF_DB_ID = "838dc154379447bab984874e7ec838bd";

async function findStaffPage(email) {
  const res = await fetch(`https://api.notion.com/v1/databases/${STAFF_DB_ID}/query`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${NOTION_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: { property: "이메일", rich_text: { equals: email } }
    }),
  });
  const data = await res.json();
  return data.results?.[0] || null;
}

export default async function handler(req, res) {
  const { email, nickname } = req.body || {};
  if (!email) return res.status(400).json({ error: "email required" });

  // GET: 닉네임 조회
  if (req.method === "GET" || (req.method === "POST" && !nickname)) {
    const page = await findStaffPage(email);
    if (!page) return res.json({ nickname: null });
    const nick = page.properties["닉네임"]?.rich_text?.[0]?.plain_text || null;
    return res.json({ nickname: nick });
  }

  // POST: 닉네임 저장/수정
  if (req.method === "POST" && nickname) {
    const page = await findStaffPage(email);

    if (page) {
      // 기존 페이지 업데이트
      await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${NOTION_KEY}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          properties: {
            "닉네임": { rich_text: [{ text: { content: nickname } }] }
          }
        }),
      });
    } else {
      // 신규 직원 페이지 생성
      await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${NOTION_KEY}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          parent: { database_id: STAFF_DB_ID },
          properties: {
            "이름": { title: [{ text: { content: email } }] },
            "이메일": { rich_text: [{ text: { content: email } }] },
            "닉네임": { rich_text: [{ text: { content: nickname } }] },
            "가입일": { date: { start: new Date().toISOString().split("T")[0] } },
          }
        }),
      });
    }
    return res.json({ ok: true });
  }

  return res.status(405).end();
}
