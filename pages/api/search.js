export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { query, mode } = req.body;
  const NOTION_KEY = process.env.NOTION_API_KEY;
  const DB_ID = process.env.NOTION_DB_ID;

  const parseRow = (page) => {
    const props = page.properties || {};
    const titleArr = props["이름(상표/디자인)"]?.title || [];
    const title = titleArr.map((t) => t.plain_text).join("") || "(제목 없음)";
    const typeArr = props["특허/상표/디자인"]?.multi_select || [];
    const type = typeArr.map((t) => t.name).join(", ");
    const status = props["상태(대표 결)"]?.status?.name || "";
    const categoryArr = props["카테고리"]?.multi_select || [];
    const category = categoryArr.map((c) => c.name).join(", ");
    const appNum = props["출원번호"]?.rich_text?.map((t) => t.plain_text).join("") || "";
    const appOwner = props["출원인(특허고객번호)"]?.rich_text?.map((t) => t.plain_text).join("") || "";
    const agentCode = props["대리인 코드"]?.rich_text?.map((t) => t.plain_text).join("") || "";
    const deadline = props["필수 마감일"]?.date?.start || "";
    const url = page.url || "";
    const docWorkStatus =
      props["서류작업상태(작업자)"]?.status?.name ||
      props["서류작업상태(작업자)"]?.select?.name ||
      props["서류작업상태(작업자)"]?.rich_text?.map((t) => t.plain_text).join("") ||
      "";

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

    return { title, type, status, category, appNum, appOwner, agentCode, deadline, url, fileLinks, docWorkStatus };
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
            page_size: 5,
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
