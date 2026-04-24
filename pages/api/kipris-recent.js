// pages/api/kipris-recent.js
// Notion DB에서 출원번호가 있는 페이지를 최신순으로 30개 반환

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const NOTION_KEY = process.env.NOTION_API_KEY;
  const DB_ID      = process.env.NOTION_DB_ID;
  if (!NOTION_KEY || !DB_ID) return res.status(500).json({ error: "환경변수 미설정" });

  // 출원번호 패턴 추출
  const extractNumbers = (text) => {
    if (!text) return [];
    return (text.match(/\d{2}-\d{4}-\d{7}/g) || []).filter((v, i, a) => a.indexOf(v) === i);
  };

  try {
    let allPages = [];
    let cursor;
    let fetched = 0;

    // 최근 100개만 조회 (출원번호 있는 것 30개 추출)
    do {
      const body = {
        sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
        page_size: 100,
        ...(cursor ? { start_cursor: cursor } : {}),
      };
      const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${NOTION_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: d.message });
      allPages = allPages.concat(d.results || []);
      cursor = d.has_more ? d.next_cursor : undefined;
      fetched++;
    } while (cursor && allPages.length < 200 && fetched < 3);

    // 출원번호 있는 것만 필터 후 30개
    const results = allPages
      .map(p => {
        const props = p.properties || {};
        const title = (props["이름(상표/디자인)"]?.title || []).map(t => t.plain_text).join("") || "(제목 없음)";
        const appNumRaw = (props["출원번호"]?.rich_text || []).map(t => t.plain_text).join("") || "";
        const nums = extractNumbers(appNumRaw);
        const statusName = props["상태(대표 결)"]?.status?.name || "";
        return { title, nums, statusName, pageId: p.id };
      })
      .filter(r => r.nums.length > 0)
      .slice(0, 30);

    return res.status(200).json({ results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
