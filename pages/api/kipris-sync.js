// pages/api/kipris-sync.js
// Notion DB 전체 출원번호 → KIPRIS 조회 → 상태/등록번호 자동 갱신
// POST /api/kipris-sync
// Body: { secret: "sync-secret" }  — 무단 실행 방지용 간단 시크릿

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { secret } = req.body;
  const SYNC_SECRET  = process.env.KIPRIS_SYNC_SECRET || "ga-sync-2026";
  if (secret !== SYNC_SECRET) return res.status(401).json({ error: "Unauthorized" });

  const NOTION_KEY   = process.env.NOTION_API_KEY;
  const DB_ID        = process.env.NOTION_DB_ID;
  const ACCESS_KEY   = process.env.KIPRIS_ACCESS_KEY;

  if (!NOTION_KEY || !DB_ID || !ACCESS_KEY) {
    return res.status(500).json({ error: "환경변수 미설정 (NOTION_API_KEY / NOTION_DB_ID / KIPRIS_ACCESS_KEY)" });
  }

  // ── 출원번호 파싱 헬퍼 ──
  const extractNumbers = (text) => {
    if (!text) return [];
    const matches = text.match(/\d{2}-\d{4}-\d{7}/g) || [];
    return [...new Set(matches)];
  };

  const fmtDate = (d) => {
    if (!d || d.length !== 8) return d;
    return `${d.slice(0,4)}.${d.slice(4,6)}.${d.slice(6,8)}`;
  };

  // ── Notion DB 전체 조회 ──
  let allPages = [];
  let cursor = undefined;
  do {
    const body = { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) };
    const r = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${NOTION_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: d.message });
    allPages = allPages.concat(d.results || []);
    cursor = d.has_more ? d.next_cursor : undefined;
  } while (cursor);

  // ── 출원번호 있는 페이지만 필터 ──
  const targets = allPages
    .map(p => {
      const raw = p.properties["출원번호"]?.rich_text?.map(t => t.plain_text).join("") || "";
      const nums = extractNumbers(raw);
      return { pageId: p.id, nums };
    })
    .filter(t => t.nums.length > 0);

  const log = [];
  let updatedCount = 0;
  let skippedCount = 0;

  // ── 각 페이지 처리 ──
  for (const { pageId, nums } of targets) {

    // 복수류인 경우 → 첫 번째 출원번호만 대표로 사용 (상태 판단)
    const representativeNum = nums[0];
    const numClean = representativeNum.replace(/-/g, "");

    let kiprisData;
    try {
      const kr = await fetch(`http://plus.kipris.or.kr/openapi/rest/RelatedDocsonfileTMService/relatedDocsonfileInfo?applicationNumber=${numClean}&accessKey=${encodeURIComponent(ACCESS_KEY)}`);
      const xml = await kr.text();

      // 간단 XML 파싱
      const getTag = (text, tag) => {
        const regex = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g");
        const matches = [];
        let m;
        while ((m = regex.exec(text)) !== null) matches.push(m[1].trim());
        return matches;
      };

      const blockRegex = /<relateddocsonfileInfo>([\s\S]*?)<\/relateddocsonfileInfo>/g;
      const items = [];
      let bm;
      while ((bm = blockRegex.exec(xml)) !== null) {
        const block = bm[1];
        const g = (tag) => getTag(block, tag)[0] || "";
        items.push({
          step: g("step"),
          status: g("status"),
          documentTitle: g("documentTitle"),
          registrationNumber: g("registrationNumber"),
          documentDate: g("documentDate"),
        });
      }

      if (items.length === 0) { skippedCount++; log.push({ pageId, num: representativeNum, result: "이력없음" }); continue; }

      const latestItem = items[items.length - 1];
      const registrationNumber = items.map(i => i.registrationNumber).find(r => r && r.trim()) || null;

      kiprisData = { items, latestItem, registrationNumber };
    } catch (e) {
      log.push({ pageId, num: representativeNum, result: `KIPRIS 오류: ${e.message}` });
      skippedCount++;
      continue;
    }

    // ── Notion 상태 매핑 ──
    // step=등록 → 출원완료, 그 외는 건드리지 않음 (수동 관리 존중)
    const { latestItem, registrationNumber } = kiprisData;
    const updates = {};

    // 등록번호 갱신 (있고, Notion에 아직 없을 때)
    const currentPage = allPages.find(p => p.id === pageId);
    const currentRegNum = currentPage?.properties["등록번호"]?.rich_text?.map(t => t.plain_text).join("") || "";

    if (registrationNumber && !currentRegNum) {
      updates["등록번호"] = { rich_text: [{ text: { content: registrationNumber } }] };
    }

    // 상태 갱신: 등록 단계이고 현재 상태가 "출원서 작성 중" 또는 "출원완료"인 경우만
    const currentStatus = currentPage?.properties["상태(대표 결)"]?.status?.name || "";
    if (latestItem.step === "등록" && registrationNumber) {
      if (currentStatus === "출원서 작성 중" || currentStatus === "출원완료" || currentStatus === "") {
        updates["상태(대표 결)"] = { status: { name: "출원완료" } };
      }
    }

    if (Object.keys(updates).length === 0) {
      log.push({ pageId, num: representativeNum, result: "변경없음", step: latestItem.step });
      skippedCount++;
      continue;
    }

    // ── Notion 업데이트 ──
    try {
      const ur = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${NOTION_KEY}`, "Notion-Version": "2022-06-28", "Content-Type": "application/json" },
        body: JSON.stringify({ properties: updates }),
      });
      if (ur.ok) {
        updatedCount++;
        log.push({ pageId, num: representativeNum, result: "업데이트됨", updates: Object.keys(updates), step: latestItem.step, registrationNumber });
      } else {
        const ue = await ur.json();
        log.push({ pageId, num: representativeNum, result: `업데이트 실패: ${ue.message}` });
        skippedCount++;
      }
    } catch (e) {
      log.push({ pageId, num: representativeNum, result: `업데이트 오류: ${e.message}` });
      skippedCount++;
    }

    // API 레이트 리밋 방지 (0.3초 간격)
    await new Promise(r => setTimeout(r, 300));
  }

  return res.status(200).json({
    total: targets.length,
    updated: updatedCount,
    skipped: skippedCount,
    log,
  });
}
