const NOTION_KEY_GETTER = () => process.env.NOTION_API_KEY;

async function fetchBlockChildren(blockId) {
  const key = NOTION_KEY_GETTER();
  const res = await fetch(
    `https://api.notion.com/v1/blocks/${blockId}/children?page_size=100`,
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Notion-Version": "2022-06-28",
      },
    }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

function parseRichText(richTextArr = []) {
  return richTextArr.map((t) => ({
    text: t.plain_text || "",
    href: t.href || null,
    annotations: {
      bold:          t.annotations?.bold          || false,
      italic:        t.annotations?.italic        || false,
      underline:     t.annotations?.underline     || false,
      strikethrough: t.annotations?.strikethrough || false,
      code:          t.annotations?.code          || false,
      color:         t.annotations?.color         || "default",
    },
  }));
}

function parseBlock(block) {
  const type    = block.type;
  const content = block[type] || {};
  const richText  = parseRichText(content.rich_text);
  const plainText = richText.map((r) => r.text).join("");
  const hasChildren = block.has_children || false;
  const id = block.id;
  const base = { id, type, richText, plainText, hasChildren, children: [] };

  switch (type) {
    case "heading_1":
    case "heading_2":
    case "heading_3":
      return { ...base, isToggleable: content.is_toggleable || false, color: content.color || "default" };

    case "callout":
      return {
        ...base,
        icon: content.icon?.emoji || content.icon?.external?.url || "💡",
        iconType: content.icon?.type || "emoji",
        color: content.color || "default",
      };

    case "code":
      return { ...base, language: content.language || "" };

    case "image": {
      const imgUrl =
        content.type === "external" ? content.external?.url :
        content.type === "file"     ? content.file?.url      : null;
      return { ...base, imageUrl: imgUrl, caption: parseRichText(content.caption) };
    }

    case "video": {
      const videoUrl =
        content.type === "external" ? content.external?.url :
        content.type === "file"     ? content.file?.url      : null;
      return { ...base, videoUrl, caption: parseRichText(content.caption) };
    }

    case "bookmark":
    case "link_preview":
      return { ...base, url: content.url || "", caption: parseRichText(content.caption) };

    case "table":
      return {
        ...base,
        tableWidth:      content.table_width       || 0,
        hasColumnHeader: content.has_column_header || false,
        hasRowHeader:    content.has_row_header    || false,
      };

    case "table_row":
      return { ...base, cells: (content.cells || []).map((cell) => parseRichText(cell)) };

    case "to_do":
      return { ...base, checked: content.checked || false };

    case "equation":
      return { ...base, expression: content.expression || "" };

    default:
      return base;
  }
}

async function fetchBlocksRecursive(blockId, depth = 0) {
  if (depth > 3) return [];
  const raw    = await fetchBlockChildren(blockId);
  const blocks = raw.map(parseBlock);

  await Promise.all(
    blocks.map(async (block) => {
      if (!block.hasChildren) return;
      block.children = await fetchBlocksRecursive(block.id, depth + 1);
    })
  );

  return blocks;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const { pageId } = req.query;
  if (!pageId) return res.status(400).json({ error: "pageId required" });

  try {
    const blocks = await fetchBlocksRecursive(pageId, 0);
    return res.status(200).json({ blocks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
