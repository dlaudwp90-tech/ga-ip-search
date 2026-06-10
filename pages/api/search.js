// ============================================================================
// pages/api/search.js  —  노션 DB 검색/최근편집 API (홈페이지 index.js 가 사용)
// ----------------------------------------------------------------------------
//  · 노션에서 결과를 받아 화면에 필요한 형태로 가공해 돌려줍니다.
//  · 글자색/볼드 표시: 각 텍스트 속성의 '줄별 색·볼드 정보'를 함께 내려줍니다
//    (titleStyle, appNumStyles, appOwnerStyles, agentCodeStyles).
//    화면(index.js)이 이 정보를 보고 글자에 색·볼드를 적용합니다.
// ============================================================================

// ── 노션 rich_text → 줄별 색/볼드 정보 추출 ──
//   각 줄(\n 기준)마다 { c: 색이름|null, b: 볼드여부 } 를 반환.
//   plain_text 를 이어붙인 문자열을 \n 으로 나눈 줄 순서와 정확히 일치합니다.
function richToLineStyles(richArr) {
  if (!Array.isArray(richArr) || richArr.length === 0) return [];
  const lines = [{ c: null, b: false }];
  for (const seg of richArr) {
    const ann = seg.annotations || {};
    const color = (ann.color && ann.color !== "default") ? ann.color : null; // 'default'는 색 없음
    const bold = !!ann.bold;
    const parts = (seg.plain_text || "").split("\n");
    parts.forEach((part, pi) => {
      if (pi > 0) lines.push({ c: null, b: false }); // 줄바꿈마다 새 줄 시작
      const cur = lines[lines.length - 1];
      if (color && !cur.c) cur.c = color; // 그 줄의 첫 색을 대표색으로
      if (bold) cur.b = true;
    });
  }
  return lines;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { query, mode } = req.body;
  const NOTION_KEY = process.env.NOTION_API_KEY;
  const DB_ID = process.env.NOTION_DB_ID;

  const parseRow = (page) => {
    const props = page.properties || {};
    const titleArr = props["이름(상표/디자인)"]?.title || [];
    const title = titleArr.map((t) => t.plain_text).join("") || "(제목 없음)";

    // 유형 — multi_select (이름+색상 배열)
    const typeItems = (props["특허/상표/디자인"]?.multi_select || []).map((t) => ({
      name: t.name, color: t.color || "default"
    }));

    // 상태 — status (이름+색상 단일)
    const statusProp = props["상태(대표 결)"]?.status;
    const statusItem = statusProp ? { name: statusProp.name, color: statusProp.color || "default" } : null;

    // 카테고리 — multi_select (이름+색상 배열)
    const categoryItems = (props["카테고리"]?.multi_select || []).map((c) => ({
      name: c.name, color: c.color || "default"
    }));

    // 서류작업상태 — status 또는 select (이름+색상 단일)
    const docWorkRaw = props["서류작업상태(작업자)"]?.status || props["서류작업상태(작업자)"]?.select || null;
    const docWorkStatusItem = docWorkRaw ? { name: docWorkRaw.name, color: docWorkRaw.color || "default" } : null;

    const appNum = props["출원번호"]?.rich_text?.map((t) => t.plain_text).join("") || "";
    const appOwner = props["출원인(특허고객번호)"]?.rich_text?.map((t) => t.plain_text).join("") || "";
    const agentCode = props["대리인 코드"]?.rich_text?.map((t) => t.plain_text).join("") || "";
    const deadline = props["필수 마감일"]?.date?.start || "";
    const url = page.url || "";

    // (파일명)URL 형식 파싱
    const fileLinksRaw = props["파일다운링크"]?.rich_text?.map((t) => t.plain_text).join("") || "";
    const fileLinks = fileLinksRaw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const match = line.match(/^\(.+?\)(https?:\/\/.+)$/);
        return match ? match[1] : line;
      })
      .join("\n");

    const pageId = page.id?.replace(/-/g, "") || "";
    const lastEditedTime = page.last_edited_time || "";
    // ↓ 노션 글자색·볼드(줄별) 정보 — 화면에서 그대로 표시하기 위해 함께 내려보냄
    const titleStyleArr   = richToLineStyles(titleArr);
    const appNumStyles    = richToLineStyles(props["출원번호"]?.rich_text);
    const appOwnerStyles  = richToLineStyles(props["출원인(특허고객번호)"]?.rich_text);
    const agentCodeStyles = richToLineStyles(props["대리인 코드"]?.rich_text);
    return { title, typeItems, statusItem, categoryItems, docWorkStatusItem,
             appNum, appOwner, agentCode, deadline, url, fileLinks, pageId, lastEditedTime,
             titleStyle: titleStyleArr[0] || null, appNumStyles, appOwnerStyles, agentCodeStyles };
  };

  try {
    // 최근 수정 5개 조회 모드
    if (mode === "recent") {
      const response = await fetch(
        `https://api.notion.com/v1/databases/${DB_ID}/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${NOTION_KEY}`,
            "Notion-Version": "2022-06-28",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
            page_size: 20,
          }),
        }
      );
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.message });
      return res.status(200).json({ results: (data.results || []).map(parseRow) });
    }

    // 일반 검색 모드
    if (!query) return res.status(400).json({ error: "query required" });

    const response = await fetch(
      `https://api.notion.com/v1/databases/${DB_ID}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${NOTION_KEY}`,
          "Notion-Version": "2022-06-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filter: {
            or: [
              { property: "이름(상표/디자인)", title: { contains: query } },
              { property: "출원번호", rich_text: { contains: query } },
              { property: "출원인(특허고객번호)", rich_text: { contains: query } },
              { property: "대리인 코드", rich_text: { contains: query } },
            ],
          },
          sorts: [{ timestamp: "last_edited_time", direction: "descending" }],
          page_size: 100,
        }),
      }
    );
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.message });
    return res.status(200).json({ results: (data.results || []).map(parseRow) });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
