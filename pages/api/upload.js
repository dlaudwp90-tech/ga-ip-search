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

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { fileName, fileData, contentType, folder } = req.body;
  if (!fileName || !fileData) {
    return res.status(400).json({ error: "fileName, fileData 필요" });
  }

  const key = folder ? `${folder}/${fileName}` : fileName;
  const buffer = Buffer.from(fileData, "base64");

  try {
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: contentType || "application/octet-stream",
      })
    );

    const url = `${process.env.R2_PUBLIC_URL}/${key}`;
    return res.status(200).json({ ok: true, url, key });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
