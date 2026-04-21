// pages/api/db-options.js
// Notion DB 스키마 — multi_select/status 옵션 + status groups 반환
// Notion API 2025-09-03 — data_source 엔드포인트 사용 (스키마는 data_source에 있음)

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const NOTION_KEY = process.env.NOTION_API_KEY;
  const DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID;

  try {
    const response = await fetch(`https://api.notion.com/v1/data_sources/${DATA_SOURCE_ID}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${NOTION_KEY}`,
        "Notion-Version": "2025-09-03",
      },
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.message });

    const props = data.properties || {};

    // multi_select — 이름+색상 배열
    const extractMultiSelect = (propName) => {
      const p = props[propName];
      if (!p?.multi_select?.options) return [];
      return p.multi_select.options.map((o) => ({
        name: o.name,
        color: o.color || "default",
      }));
    };

    // status — options + groups 구조 반환
    // groups: [{ name: "할 일", color: "gray", options: [{name,color}, ...] }, ...]
    const extractStatusWithGroups = (propName) => {
      const p = props[propName];
      if (!p?.status) return { options: [], groups: [] };
      const rawOptions = p.status.options || [];
      const rawGroups = p.status.groups || [];

      const options = rawOptions.map((o) => ({
        name: o.name,
        color: o.color || "default",
      }));

      // option id → option 매핑
      const idToOpt = {};
      rawOptions.forEach((o) => {
        idToOpt[o.id] = { name: o.name, color: o.color || "default" };
      });

      const groups = rawGroups.map((g) => ({
        name: g.name,
        color: g.color || "default",
        options: (g.option_ids || [])
          .map((id) => idToOpt[id])
          .filter(Boolean),
      }));

      return { options, groups };
    };

    // status가 select인 경우도 대비 (groups 없음)
    const extractStatusOrSelectWithGroups = (propName) => {
      const p = props[propName];
      if (p?.status) return extractStatusWithGroups(propName);
      if (p?.select?.options) {
        return {
          options: p.select.options.map((o) => ({
            name: o.name,
            color: o.color || "default",
          })),
          groups: [],
        };
      }
      return { options: [], groups: [] };
    };

    const statusFull = extractStatusWithGroups("상태(대표 결)");
    const docWorkFull = extractStatusOrSelectWithGroups("서류작업상태(작업자)");

    return res.status(200).json({
      types:              extractMultiSelect("특허/상표/디자인"),
      statuses:           statusFull.options,
      statusGroups:       statusFull.groups,
      docWorkStates:      docWorkFull.options,
      docWorkStateGroups: docWorkFull.groups,
      categories:         extractMultiSelect("카테고리"),
      productClasses:     extractMultiSelect("상품류"),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
