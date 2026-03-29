import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
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
        filter: {
          property: "이름(상표/디자인)",
          title: { equals: title },
        },
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
    data.properties?.["파일다운링크"]?.rich_text
      ?.map((t) => t.plain_text)
      .join("") || "";

  const updated = existing ? `${existing}\n${newUrl}` : newUrl;

  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        파일다운링크: {
          rich_text: [{ type: "text", text: { content: updated } }],
        },
      },
    }),
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { action, fileName, contentType, folder } = req.body;

  // Presigned URL 발급
  if (action === "presign") {
    const key = folder ? `${folder}/${fileName}` : fileName;
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType || "application/octet-stream",
    });
    const presignedUrl = await getSignedUrl(s3, command, { expiresIn: 300 });
    const publicUrl = `${process.env.R2_PUBLIC_URL}/${key}`;
    return res.status(200).json({ presignedUrl, publicUrl, key });
  }

  // Notion 기입
  if (action === "notify") {
    const { publicUrl } = req.body;
    let notionUpdated = false;
    if (folder) {
      const pageId = await getNotionPageId(folder);
      if (pageId) {
        await appendFileLink(pageId, publicUrl);
        notionUpdated = true;
      }
    }
    return res.status(200).json({ ok: true, notionUpdated });
  }

  return res.status(400).json({ error: "action 필요 (presign | notify)" });
}
