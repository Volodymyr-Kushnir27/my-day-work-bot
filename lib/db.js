// lib/notion.js
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

/**
 * objects – масив з analyzeDay (JSON.parse(result))
 * telegramId – chat.id з Telegram
 * rawText – сирий текст дня (для зберігання в колонку Raw text, якщо є)
 */
export async function saveObjectsToNotion(objects, telegramId, rawText = "") {
  if (!Array.isArray(objects)) {
    console.error("saveObjectsToNotion: objects is not an array", objects);
    return;
  }

  for (const obj of objects) {
    const {
      date,
      time,
      object_name,
      location,
      work_done,
      workers,
      income,
    } = obj;

    try {
      await notion.pages.create({
        parent: { database_id: databaseId },
        properties: {
          // Заголовок
          "Object name": {
            title: [
              {
                type: "text",
                text: { content: object_name || "Без назви" },
              },
            ],
          },

          Date: date
            ? {
                date: {
                  start: date, // "YYYY-MM-DD"
                },
              }
            : undefined,

          Time: time
            ? {
                rich_text: [
                  {
                    type: "text",
                    text: { content: time }, // "HH:MM"
                  },
                ],
              }
            : undefined,

          "Telegram ID": {
            rich_text: [
              {
                type: "text",
                text: { content: String(telegramId) },
              },
            ],
          },

          Location: location
            ? {
                rich_text: [
                  {
                    type: "text",
                    text: { content: location },
                  },
                ],
              }
            : undefined,

          "Work done": work_done
            ? {
                rich_text: [
                  {
                    type: "text",
                    text: { content: work_done },
                  },
                ],
              }
            : undefined,

          Workers: Array.isArray(workers)
            ? {
                multi_select: workers.map((w) => ({
                  name: w,
                })),
              }
            : undefined,

          Income: typeof income === "number"
            ? {
                number: income,
              }
            : undefined,
        },
      });
    } catch (err) {
      console.error("Notion create page error:", err.body || err);
    }
  }
}
