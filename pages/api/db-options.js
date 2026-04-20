// pages/api/db-options.js
// Notion DB 스키마에서 필터 옵션을 동적으로 조회
// — 하드코딩 대신 DB 수정 시 자동 반영되도록

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const NOTION_KEY = process.env.NOTION_API_KEY;
  const DB_ID = process.env.NOTION_DB_ID;

  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${NOTION_KEY}`,
        "Notion-Version": "2022-06-28",
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

    // status — groups/options 모두 고려
    const extractStatus = (propName) => {
      const p = props[propName];
      if (!p?.status?.options) return [];
      return p.status.options.map((o) => ({
        name: o.name,
        color: o.color || "default",
      }));
    };

    // status 또는 select 혼용 대응
    const extractStatusOrSelect = (propName) => {
      const p = props[propName];
      if (p?.status?.options) {
        return p.status.options.map((o) => ({ name: o.name, color: o.color || "default" }));
      }
      if (p?.select?.options) {
        return p.select.options.map((o) => ({ name: o.name, color: o.color || "default" }));
      }
      return [];
    };

    return res.status(200).json({
      types:        extractMultiSelect("특허/상표/디자인"),
      statuses:     extractStatus("상태(대표 결)"),
      docWorkStates: extractStatusOrSelect("서류작업상태(작업자)"),
      categories:   extractMultiSelect("카테고리"),
      productClasses: extractMultiSelect("상품류"),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
