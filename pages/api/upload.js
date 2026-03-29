import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export const config = {
  api: { bodyParser: { sizeLimit: "150mb" } },
};

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
  // 기존 파일다운링크 가져오기
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${process.env.NOTION_API_KEY}`,
      "Notion-Version": "2022-06-28",
    },
  });
  const data = await res.json();
  const existing = data.properties?.["파일다운링크"]?.rich_text
    ?.map((t) => t.plain_text)
    .join("") || "";

  const updated = existing
    ? `${existing}\n${newUrl}`
    : newUrl;

  // 업데이트
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

  const { fileName, fileData, contentType, folder } = req.body;
  if (!fileName || !fileData) {
    return res.status(400).json({ error: "fileName, fileData 필요" });
  }

  const key = folder ? `${folder}/${fileName}` : fileName;
  const buffer = Buffer.from(fileData, "base64");

  try {
    // R2 업로드
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType || "application/octet-stream",
      })
    );

    const url = `${process.env.R2_PUBLIC_URL}/${key}`;

    // Notion DB 자동 기입
    let notionUpdated = false;
    if (folder) {
      const pageId = await getNotionPageId(folder);
      if (pageId) {
        await appendFileLink(pageId, url);
        notionUpdated = true;
      }
    }

    return res.status(200).json({ ok: true, url, key, notionUpdated });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
