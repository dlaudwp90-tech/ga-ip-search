// pages/api/diag.js
// 가설: 토큰이 "정렬 기준 상위 300건"만 본다
// 검증: 정렬 4종으로 각각 fetch → union 사이즈가 300보다 크면 가설 확정
// 주소창 호출: /api/diag

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const NOTION_KEY = process.env.NOTION_API_KEY;
  const DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID;

  const queryAll = async (sorts) => {
    const ids = new Set();
    let cursor = undefined;
    let hasMore = true;
    try {
      while (hasMore) {
        const body = { page_size: 100, sorts };
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
        if (!r.ok) return { error: data.message || `HTTP ${r.status}`, ids: [] };
        for (const p of (data.results || [])) ids.add(p.id);
        hasMore = data.has_more;
        cursor = data.next_cursor;
      }
      return { count: ids.size, ids: Array.from(ids) };
    } catch (e) {
      return { error: e.message, ids: [] };
    }
  };

  const R1 = await queryAll([{ timestamp: "created_time", direction: "descending" }]);
  const R2 = await queryAll([{ timestamp: "created_time", direction: "ascending" }]);
  const R3 = await queryAll([{ timestamp: "last_edited_time", direction: "descending" }]);
  const R4 = await queryAll([{ timestamp: "last_edited_time", direction: "ascending" }]);

  const unionSet = new Set([...R1.ids, ...R2.ids, ...R3.ids, ...R4.ids]);

  // 각 집합의 고유 contribution
  const base = new Set(R1.ids);
  const r2_extra = R2.ids.filter((id) => !base.has(id)).length;
  const r3_extra = R3.ids.filter((id) => !base.has(id) && !R2.ids.includes(id)).length;
  const mergedAfterR3 = new Set([...R1.ids, ...R2.ids, ...R3.ids]);
  const r4_extra = R4.ids.filter((id) => !mergedAfterR3.has(id)).length;

  return res.status(200).json({
    R1_created_desc: R1.count,
    R2_created_asc: R2.count,
    R3_edited_desc: R3.count,
    R4_edited_asc: R4.count,
    union_total: unionSet.size,
    contribution: {
      R1_alone: R1.count,
      R2_added: r2_extra,
      R3_added: r3_extra,
      R4_added: r4_extra,
    },
    conclusion:
      unionSet.size > 300
        ? `🎉 가설 확정: 정렬별로 다른 집합을 반환. union=${unionSet.size}. merge 전략으로 해결 가능.`
        : "❌ 정렬에 관계없이 동일한 300건. 가설 기각. 우회 방법 없음.",
  });
}
