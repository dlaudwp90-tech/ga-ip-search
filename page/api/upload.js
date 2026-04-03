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

async function appendFileLink(pageId, newUrl) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
    },
  });
  const data = await res.json();
  const existing =
    data.properties?.["파일다운링크"]?.rich_text?.map((t) => t.plain_text).join("") || "";

  // URL 인코딩
  const encodedUrl = newUrl.split("/").map((part, i) =>
    i < 3 ? part : encodeURIComponent(decodeURIComponent(part))
  ).join("/");

  // (파일명)URL 형식으로 저장
  const fileName = decodeURIComponent(newUrl.split("/").pop());
  const entry = `(${fileName})${encodedUrl}`;
  const updated = existing ? `${existing}\n${entry}` : entry;

  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        파일다운링크: { rich_text: [{ type: "text", text: { content: updated } }] },
      },
    }),
  });
}

async function removeFileLink(pageId, urlToRemove) {
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
    },
  });
  const data = await res.json();
  const existing =
    data.properties?.["파일다운링크"]?.rich_text?.map((t) => t.plain_text).join("") || "";

  const updated = existing
    .split("\n")
    .filter((line) => {
      // (파일명)URL 형식 또는 기존 URL 형식 모두 처리
      const match = line.match(/^\(.+?\)(https?:\/\/.+)$/);
      const lineUrl = match ? match[1] : line.trim();
      return decodeURIComponent(lineUrl) !== decodeURIComponent(urlToRemove.trim());
    })
    .join("\n");

  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        파일다운링크: { rich_text: [{ type: "text", text: { content: updated } }] },
      },
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { action, fileName, contentType, folder, publicUrl, key } = req.body;

  // Notion DB 일치 여부 사전 확인
  if (action === "check") {
    const pageId = await getNotionPageId(folder);
    return res.status(200).json({ exists: !!pageId });
  }

  // Presigned URL 발급
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

  // Notion 기입
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

  // 파일 삭제
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

  // 폴더 파일 목록 조회
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
