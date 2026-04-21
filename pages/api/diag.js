// pages/api/diag.js
// DB의 data_source 구조 + 토큰 지문 + 권한 진단
// 주소창에서 GET 호출: /api/diag

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const NOTION_KEY = process.env.NOTION_API_KEY || "";
  const DB_ID = process.env.NOTION_DB_ID;
  const CONFIGURED_DS_ID = process.env.NOTION_DATA_SOURCE_ID;

  // 토큰 지문 — 값 전체는 노출하지 않고 앞/뒤 일부만
  const tokenFingerprint = NOTION_KEY
    ? `${NOTION_KEY.slice(0, 7)}...${NOTION_KEY.slice(-4)} (길이: ${NOTION_KEY.length})`
    : "(환경변수 없음)";

  try {
    // 1) DB 자체 조회 → data_sources 배열 획득
    const dbRes = await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, {
      headers: {
        Authorization: `Bearer ${NOTION_KEY}`,
        "Notion-Version": "2025-09-03",
      },
    });
    const dbData = await dbRes.json();
    if (!dbRes.ok) {
      return res.status(200).json({
        token_fingerprint: tokenFingerprint,
        db_id: DB_ID,
        configured_NOTION_DATA_SOURCE_ID: CONFIGURED_DS_ID || "(환경변수 없음)",
        stage: "db_fetch_failed",
        status: dbRes.status,
        error: dbData,
        hint: dbRes.status === 401 ? "토큰이 유효하지 않음" : dbRes.status === 404 ? "Integration이 이 DB에 연결되지 않음" : "기타 오류",
      });
    }

    const dataSources = dbData.data_sources || [];
    const dbTitle = dbData.title?.[0]?.plain_text || "(제목 없음)";

    // 2) 각 data_source별로 전체 건수 집계
    const sourceDetails = [];
    for (const ds of dataSources) {
      let count = 0;
      let cursor = undefined;
      let hasMore = true;
      let errorMsg = null;

      while (hasMore) {
        const body = { page_size: 100 };
        if (cursor) body.start_cursor = cursor;
        const response = await fetch(`https://api.notion.com/v1/data_sources/${ds.id}/query`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${NOTION_KEY}`,
            "Notion-Version": "2025-09-03",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const data = await response.json();
        if (!response.ok) {
          errorMsg = data.message || `HTTP ${response.status}`;
          break;
        }
        count += (data.results || []).length;
        hasMore = data.has_more;
        cursor = data.next_cursor;
      }

      sourceDetails.push({
        id: ds.id,
        name: ds.name || "(이름 없음)",
        count: errorMsg ? null : count,
        matches_configured: ds.id === CONFIGURED_DS_ID || ds.id.replace(/-/g, "") === (CONFIGURED_DS_ID || "").replace(/-/g, ""),
        error: errorMsg,
      });
    }

    const total = sourceDetails.reduce((sum, d) => sum + (d.count || 0), 0);

    return res.status(200).json({
      token_fingerprint: tokenFingerprint,
      db_id: DB_ID,
      db_title: dbTitle,
      configured_NOTION_DATA_SOURCE_ID: CONFIGURED_DS_ID || "(환경변수 없음)",
      number_of_data_sources: dataSources.length,
      data_sources: sourceDetails,
      total_across_all_sources: total,
      diagnosis:
        dataSources.length === 0
          ? "⚠ data_source가 0개 — DB 조회 권한 문제"
          : dataSources.length === 1
          ? `✅ single-source DB. 토큰이 접근 가능한 건수 = ${total}`
          : `⚠ multi-source DB (${dataSources.length}개 소스).`,
    });
  } catch (err) {
    return res.status(500).json({
      token_fingerprint: tokenFingerprint,
      error: err.message,
    });
  }
}
