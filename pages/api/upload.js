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
  const { action, fileName, contentType, folder, publicUrl, key } = req.body;

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
    if (folder) {
      const pageId = await getNotionPageId(folder);
      if (pageId) {
        notionFound = true;
        await appendFileLink(pageId, publicUrl);
        notionUpdated = true;
      }
    }
    return res.status(200).json({ ok: true, notionUpdated, notionFound });
  }

  if (action === "delete") {
    try {
      await s3.send(new DeleteObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
      }));
      if (folder) {
        const pageId = await getNotionPageId(folder);
        if (pageId) await removeFileLink(pageId, publicUrl);
      }
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
      }));
      return res.status(200).json({ files });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: "action 필요 (check | presign | notify | delete | list)" });
}
