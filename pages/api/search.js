// ============================================================================
// pages/api/search.js  —  노션 DB 검색/최근편집 API (홈페이지 index.js 가 사용)
// ----------------------------------------------------------------------------
//  · 노션에서 결과를 받아 화면에 필요한 형태로 가공해 돌려줍니다.
//  · 글자색/볼드 표시: 각 텍스트 속성의 '조각별 색·볼드 정보'를 함께 내려줍니다
//    (titleSegs, appNumSegs, appOwnerSegs, agentCodeSegs).
//    화면(index.js)이 이 정보를 보고 글자에 색·볼드를 적용합니다.
//
//  ⚠ 수정 주의
//   · 예전 버전은 '줄마다 색 1개'만 저장해서, 한 줄에 색이 두 개 이상이면
//     첫 색만 살아남고 나머지는 사라졌습니다. (예: "1차OA - "(파랑) + "기간연장"(빨강))
//     이제는 줄 안의 '조각'을 그대로 보존합니다.
//   · 예전 필드(titleStyle / appNumStyles / …)도 호환을 위해 함께 내려보냅니다.
//     지우지 마세요 — 다른 화면이 아직 쓸 수 있습니다.
// ============================================================================

// ── 노션 rich_text → 줄별·조각별 색/볼드 정보 추출 ──
//   반환값: [ [ {t:"글자", c:"색이름|null", b:볼드여부}, ... ],  ← 1번째 줄의 조각들
//            [ ... ],                                          ← 2번째 줄의 조각들
//            [] ]                                              ← 빈 줄 (조각 없음)
//   plain_text 를 이어붙인 문자열을 \n 으로 나눈 줄 순서와 정확히 일치합니다.
function richToLineSegs(richArr) {
  if (!Array.isArray(richArr) || richArr.length === 0) return [];
  const lines = [[]];
  for (const seg of richArr) {
    const ann = seg.annotations || {};
    const color = (ann.color && ann.color !== "default") ? ann.color : null; // 'default'는 색 없음
    const bold = !!ann.bold;
    const parts = (seg.plain_text || "").split("\n");
    parts.forEach((part, pi) => {
      if (pi > 0) lines.push([]);   // 줄바꿈마다 새 줄 시작
      if (part === "") return;      // 빈 조각은 건너뜀 (색이 다음 줄로 번지는 것 방지)
      lines[lines.length - 1].push({ t: part, c: color, b: bold });
    });
  }
  return lines;
}

// ── (호환용) 예전 방식: 줄마다 대표 색 1개 ──
//   새 화면은 위의 richToLineSegs 를 씁니다. 이 함수는 옛 화면 호환용으로만 남깁니다.
function segsToLineStyles(lineSegs) {
  return lineSegs.map((segs) => {
    const out = { c: null, b: false };
    for (const s of segs) {
      if (s.c && !out.c) out.c = s.c;
      if (s.b) out.b = true;
    }
    return out;
  });
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

    // ↓ 노션 글자색·볼드(조각별) 정보 — 화면에서 그대로 표시하기 위해 함께 내려보냄
    const titleSegs     = richToLineSegs(titleArr);
    const appNumSegs    = richToLineSegs(props["출원번호"]?.rich_text);
    const appOwnerSegs  = richToLineSegs(props["출원인(특허고객번호)"]?.rich_text);
    const agentCodeSegs = richToLineSegs(props["대리인 코드"]?.rich_text);

    // ↓ (호환용) 예전 줄별 색 정보
    const appNumStyles    = segsToLineStyles(appNumSegs);
    const appOwnerStyles  = segsToLineStyles(appOwnerSegs);
    const agentCodeStyles = segsToLineStyles(agentCodeSegs);

    return { title, typeItems, statusItem, categoryItems, docWorkStatusItem,
             appNum, appOwner, agentCode, deadline, url, fileLinks, pageId, lastEditedTime,
             titleSegs, appNumSegs, appOwnerSegs, agentCodeSegs,
             titleStyle: segsToLineStyles(titleSegs)[0] || null,
             appNumStyles, appOwnerStyles, agentCodeStyles };
  };

  try {
    // 최근 수정 목록 모드 (limit 만큼, '더보기' 지원)
    //   · limit(기본 25)만큼 최근 편집순으로 반환. Notion은 한 번에 최대 100개라
    //     limit 이 100을 넘으면 커서로 이어서 모읍니다.
    //   · hasMore: limit 을 넘어 더 있는지 여부 → 화면의 '더보기' 버튼 표시에 사용.
    if (mode === "recent") {
      const rawLimit = parseInt(req.body.limit, 10);
      const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? rawLimit : 25, 1), 500);
      const sorts = [{ timestamp: "last_edited_time", direction: "descending" }];
      let all = [];
      let cursor = undefined;
      let hasMore = false;
      while (all.length < limit) {
        const pageSize = Math.min(100, limit - all.length);
        const body = { sorts, page_size: pageSize, ...(cursor ? { start_cursor: cursor } : {}) };
        const response = await fetch(
          `https://api.notion.com/v1/databases/${DB_ID}/query`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${NOTION_KEY}`,
              "Notion-Version": "2022-06-28",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );
        const data = await response.json();
        if (!response.ok) return res.status(response.status).json({ error: data.message });
        all = all.concat((data.results || []).map(parseRow));
        hasMore = !!data.has_more;
        cursor = data.next_cursor;
        if (!data.has_more) break;
      }
      return res.status(200).json({ results: all.slice(0, limit), hasMore });
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
