// ============================================================================
// pages/api/upload.js  —  파일 업로드(R2) + 노션 '파일다운링크' 갱신 API
// ----------------------------------------------------------------------------
// [액션]
//   check   : 폴더명(=문서 제목)에 해당하는 노션 페이지가 있는지 확인
//   presign : R2 업로드용 임시 주소 발급
//   notify  : 업로드 완료 → 노션 '파일다운링크'에 (파일명)URL 추가
//   delete  : R2에서 영구 삭제 + 노션 링크 제거
//   list    : 한 폴더의 파일 목록 (이름·주소·크기·업로드시각)
//   dates   : 여러 폴더의 '파일별 업로드 시각'만 한 번에 조회  ← 카드 파일 날짜 정렬용
//
// ⚠ 수정 주의
//   · 노션 '파일다운링크'는 (파일명)URL 형식 한 줄씩입니다. 형식을 바꾸면 화면 파싱이 깨집니다.
//   · R2 폴더명은 예전 파일은 '문서 제목', 최근 업로드는 '노션 pageId'입니다.
//     그래서 dates 액션은 폴더를 여러 개 한꺼번에 받도록 되어 있습니다.
// ============================================================================
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// rich_text를 2000자 단위로 분할
function toRichTextBlocks(text) {
  const MAX = 1900; // 여유있게 1900자
  const blocks = [];
  let remaining = text;
  while (remaining.length > 0) {
    // 줄바꿈 경계에서 자르기
    let cut = MAX;
    if (remaining.length > MAX) {
      const lastNewline = remaining.lastIndexOf("\n", MAX);
      if (lastNewline > 0) cut = lastNewline + 1;
    }
    blocks.push({ type: "text", text: { content: remaining.slice(0, cut) } });
    remaining = remaining.slice(cut);
  }
  return blocks;
}

async function getNotionPageId(title) {
  const res = await fetch(
    `https://api.notion.com/v1/databases/${process.env.NOTION_DB_ID}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: { property: "이름(상표/디자인)", title: { equals: title } },
      }),
    }
  );
  const data = await res.json();
  return data.results?.[0]?.id || null;
}

async function getCurrentLinks(pageId) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
    },
  });
  const data = await res.json();
  // rich_text 배열의 모든 블록을 합쳐서 반환
  return data.properties?.["파일다운링크"]?.rich_text?.map((t) => t.plain_text).join("") || "";
}

async function saveLinks(pageId, text) {
  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        파일다운링크: { rich_text: toRichTextBlocks(text) },
      },
    }),
  });
}

async function appendFileLink(pageId, newUrl) {
  const existing = await getCurrentLinks(pageId);

  const encodedUrl = newUrl.split("/").map((part, i) =>
    i < 3 ? part : encodeURIComponent(decodeURIComponent(part))
  ).join("/");

  const fileName = decodeURIComponent(newUrl.split("/").pop());
  const entry = `(${fileName})${encodedUrl}`;
  const updated = existing ? `${existing}\n${entry}` : entry;

  await saveLinks(pageId, updated);
}

async function removeFileLink(pageId, urlToRemove) {
  const existing = await getCurrentLinks(pageId);

  const updated = existing
    .split("\n")
    .filter((line) => {
      const match = line.match(/^\(.+?\)(https?:\/\/.+)$/);
      const lineUrl = match ? match[1] : line.trim();
      return decodeURIComponent(lineUrl) !== decodeURIComponent(urlToRemove.trim());
    })
    .join("\n");

  await saveLinks(pageId, updated);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { action, fileName, contentType, folder, folders, publicUrl, key, pageId } = req.body;

  if (action === "check") {
    const pageId = await getNotionPageId(folder);
    return res.status(200).json({ exists: !!pageId });
  }

  if (action === "presign") {
    const fileKey = folder ? `${folder}/${fileName}` : fileName;
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: fileKey,
      ContentType: contentType || "application/octet-stream",
    });
    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    const pubUrl = `${process.env.R2_PUBLIC_URL}/${fileKey}`;
    return res.status(200).json({ presignedUrl, publicUrl: pubUrl, key: fileKey });
  }

  if (action === "notify") {
    let notionUpdated = false;
    let notionFound = false;
    // pageId가 오면 제목 조회 없이 그 페이지를 바로 사용(카드 업로드용). 없으면 기존처럼 폴더명=제목으로 조회.
    const pid = pageId || (folder ? await getNotionPageId(folder) : null);
    if (pid) {
      notionFound = true;
      await appendFileLink(pid, publicUrl);
      notionUpdated = true;
    }
    return res.status(200).json({ ok: true, notionUpdated, notionFound });
  }

  if (action === "delete") {
    try {
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
      }));
      const pid = pageId || (folder ? await getNotionPageId(folder) : null);
      if (pid) await removeFileLink(pid, publicUrl);
      return res.status(200).json({ ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (action === "list") {
    try {
      const command = new ListObjectsV2Command({
        Bucket: process.env.R2_BUCKET_NAME,
        Prefix: `${folder}/`,
      });
      const data = await s3.send(command);
      const files = (data.Contents || []).map((obj) => ({
        key: obj.Key,
        name: obj.Key.split("/").pop(),
        url: `${process.env.R2_PUBLIC_URL}/${obj.Key}`,
        size: obj.Size,
        // 업로드 시각(R2가 기록한 마지막 수정 시각) — 화면에서 날짜별 정렬·구분선에 사용
        lastModified: obj.LastModified ? new Date(obj.LastModified).toISOString() : null,
      }));
      return res.status(200).json({ files });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── dates: 여러 폴더의 '파일별 업로드 시각'을 한 번에 조회 ──
  //   요청: { action:"dates", folders:["폴더1","폴더2", ...] }
  //   응답: { dates: { "폴더1/파일명.pdf": "2026-04-22T05:11:03.000Z", ... } }
  //   화면(index.js)이 카드의 파일들을 날짜순으로 정렬하고 날짜 구분선을 그리는 데 씁니다.
  //   ⚠ 폴더 하나당 R2 목록조회 1회 → 한 번에 최대 80개 폴더로 제한.
  if (action === "dates") {
    try {
      const list = (Array.isArray(folders) ? folders : [folder])
        .filter((f) => typeof f === "string" && f.length > 0)
        .slice(0, 80);
      const out = {};
      await Promise.all(
        list.map(async (f) => {
          try {
            const data = await s3.send(new ListObjectsV2Command({
              Bucket: process.env.R2_BUCKET_NAME,
              Prefix: `${f}/`,
            }));
            (data.Contents || []).forEach((obj) => {
              if (obj.LastModified) out[obj.Key] = new Date(obj.LastModified).toISOString();
            });
          } catch {
            // 폴더 하나가 실패해도 나머지는 정상 반환 (조용히 건너뜀)
          }
        })
      );
      return res.status(200).json({ dates: out });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: "action 필요 (check | presign | notify | delete | list | dates)" });
}
