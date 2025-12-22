// lib/notion.js
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

export async function saveObjectsToNotion(objects, telegramId, rawText = "") {
  if (!Array.isArray(objects)) {
    console.error("saveObjectsToNotion: objects is not an array", objects);
    return;
  }

  for (const obj of objects) {
    const { date, time, object_name, location, work_done, workers, income } =
      obj;

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

          Workers: workers
            ? {
                rich_text: [
                  {
                    type: "text",
                    text: {
                      content: Array.isArray(workers)
                        ? workers.join(", ")
                        : String(workers),
                    },
                  },
                ],
              }
            : undefined,
        },
      });
    } catch (err) {
      console.error("Notion create page error:", err.body || err);
    }
  }
}
