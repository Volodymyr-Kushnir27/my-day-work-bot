// lib/notion.js
import { Client } from "@notionhq/client";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

/**
 * objects – масив з analyzeDay (JSON.parse(gptResult))
 * rawText – сирий текст опису дня (опціонально)
 */
export async function saveObjectsToNotion(objects, rawText = "") {
  if (!Array.isArray(objects) || objects.length === 0) {
    console.warn("saveObjectsToNotion: empty objects array");
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
          // TITLE
          "Object name": {
            title: [
              {
                type: "text",
                text: { content: object_name || "Без назви" },
              },
            ],
          },

          // Date
          Date: date
            ? {
                date: { start: date },
              }
            : undefined,

          // Time (Text)
          Time: time
            ? {
                rich_text: [
                  {
                    type: "text",
                    text: { content: time },
                  },
                ],
              }
            : undefined,

          // Location
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

          // Work done
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

          // Workers (простий текст, імена через кому)
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

          // Income (Number)
          Income:
            typeof income === "number"
              ? { number: income }
              : undefined,

          // Можна розкоментити, якщо зробиш колонку "Raw text" у Notion:
          /*
          "Raw text": rawText
            ? {
                rich_text: [
                  {
                    type: "text",
                    text: { content: rawText },
                  },
                ],
              }
            : undefined,
          */
        },
      });
    } catch (err) {
      console.error(
        "Notion create page error:",
        JSON.stringify(err.body || err, null, 2)
      );
    }
  }
}
