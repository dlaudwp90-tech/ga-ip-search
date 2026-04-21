// pages/api/diag.js
// 필터 유형별로 접근 가능한 row 수를 비교
// 목적: search.js의 "필터 우회" 현상이 재현되는지 확인
// 주소창 호출: /api/diag

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const NOTION_KEY = process.env.NOTION_API_KEY;
  const DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID;

  const countAll = async (filter) => {
    let count = 0;
    let cursor = undefined;
    let hasMore = true;
    try {
      while (hasMore) {
        const body = { page_size: 100 };
        if (filter) body.filter = filter;
        if (cursor) body.start_cursor = cursor;
        const r = await fetch(`https://api.notion.com/v1/data_sources/${DATA_SOURCE_ID}/query`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${NOTION_KEY}`,
            "Notion-Version": "2025-09-03",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const data = await r.json();
        if (!r.ok) return { error: data.message || `HTTP ${r.status}` };
        count += (data.results || []).length;
        hasMore = data.has_more;
        cursor = data.next_cursor;
      }
      return { count };
    } catch (e) {
      return { error: e.message };
    }
  };

  const results = {};
  results["A_필터없음"] = await countAll(null);
  results["B_title_is_not_empty"] = await countAll({
    property: "이름(상표/디자인)",
    title: { is_not_empty: true },
  });
  results["C_category_contains_출원"] = await countAll({
    property: "카테고리",
    multi_select: { contains: "출원" },
  });
  results["D_or_복합필터_search와동일구조"] = await countAll({
    or: [
      { property: "이름(상표/디자인)", title: { is_not_empty: true } },
      { property: "출원번호", rich_text: { is_not_empty: true } },
    ],
  });

  return res.status(200).json({
    token_last4: (NOTION_KEY || "").slice(-4),
    results,
    hint: "B/C/D 중 하나라도 A보다 크면 → 필터 우회 가능. 그대로 all.js 고치면 됩니다.",
  });
}
