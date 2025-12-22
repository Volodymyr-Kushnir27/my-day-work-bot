// api/telegram.js
import TelegramBot from "node-telegram-bot-api";
import { askGPT, analyzeDay, transcribeAudio } from "../lib/gpt.js";
import { dbSaveDay, dbGetByDate } from "../lib/notion.js";
import { createExcelFile } from "../lib/excel.js";
import { saveObjectsToNotion } from "../lib/notion.js";

export const config = { runtime: "nodejs" };

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: false });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).send("OK");

  try {
    const update = req.body;

    // ================= AUDIO / VOICE ====================
    if (update.message && (update.message.voice || update.message.audio)) {
      const chatId = update.message.chat.id;

      const fileId =
        update.message.voice?.file_id || update.message.audio?.file_id;

      const file = await bot.getFile(fileId);

      const downloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;

      const audio = await fetch(downloadUrl);
      const buffer = Buffer.from(await audio.arrayBuffer());

      // 1) Текст з аудіо
      const text = await transcribeAudio(buffer);

      // 2) JSON-аналіз дня
      const gpt = await analyzeDay(text);

      // 3) Зберегти в БД
      const date = new Date().toISOString().slice(0, 10);

      await dbSaveDay({
        telegram_id: chatId,
        date,
        raw: text,
        gpt,
        audio_text: text,
      });

      // 4) Спробувати розпарсити JSON і записати в Notion
      const objects = parseJsonArraySafe(gpt);
      if (objects.length > 0) {
        await saveObjectsToNotion(objects, chatId, text);
      }

      // 5) Відповідь користувачу
      await bot.sendMessage(chatId, `🎤 Текст:\n${text}\n\n🧠 Аналіз:\n${gpt}`);

      return res.send("ok");
    }

    // ================= TEXT MESSAGE ====================
    if (update.message) {
      const chatId = update.message.chat.id;
      const text = update.message.text || "";

      if (text === "/start") {
        await bot.sendMessage(chatId, "Привіт! Обери дію:", {
          reply_markup: {
            keyboard: [
              [{ text: "❓ Запитання" }],
              [{ text: "📝 Мій день" }],
              [{ text: "📊 Таблиці" }],
            ],
            resize_keyboard: true,
          },
        });
        return res.send("ok");
      }

      if (text === "❓ Запитання") {
        await bot.sendMessage(chatId, "Напиши питання 🔥");
        return res.send("ok");
      }

      // ---------------- МІЙ ДЕНЬ (текстовий опис) ----------------
      if (text.startsWith("Мій день") || text.length > 150) {
        const raw = text.replace(/^Мій день[:\-]\s*/i, "");
        const gpt = await analyzeDay(raw);

        const date = new Date().toISOString().slice(0, 10);

        // 1) Зберегти в Supabase
        await dbSaveDay({
          telegram_id: chatId,
          date,
          raw,
          gpt,
          audio_text: null,
        });

        // 2) Записати в Notion
        const objects = parseJsonArraySafe(gpt);
        if (objects.length > 0) {
          await saveObjectsToNotion(objects, chatId, raw);
        }

        await bot.sendMessage(chatId, `☑️ Збережено!\n\n${gpt}`);
        return res.send("ok");
      }

      // ---------------- МЕНЮ ТАБЛИЦЬ ----------------
      if (text === "📊 Таблиці") {
        await bot.sendMessage(chatId, "Оберіть рік:", {
          reply_markup: {
            inline_keyboard: [
              [{ text: "2024", callback_data: "year_2024" }],
              [{ text: "2025", callback_data: "year_2025" }],
              [{ text: "2026", callback_data: "year_2026" }],
            ],
          },
        });
        return res.send("ok");
      }

      // ---------------- ЗВИЧАЙНІ ЗАПИТАННЯ ----------------
      const answer = await askGPT(text);
      await bot.sendMessage(chatId, answer);
      return res.send("ok");
    }

    // ================= CALLBACK ====================
    if (update.callback_query) {
      const chatId = update.callback_query.message.chat.id;
      const data = update.callback_query.data;

      if (data.startsWith("year_")) {
        const year = data.split("_")[1];
        await bot.sendMessage(chatId, `Оберіть місяць ${year}:`, {
          reply_markup: { inline_keyboard: genMonths(year) },
        });
        return res.send("ok");
      }

      if (data.startsWith("month_")) {
        const [_, y, m] = data.split("_");
        await bot.sendMessage(chatId, `Оберіть день:`, {
          reply_markup: { inline_keyboard: genDays(y, m) },
        });
        return res.send("ok");
      }

      if (data.startsWith("day_")) {
        const [_, y, m, d] = data.split("_");
        const date = `${y}-${m}-${d}`;

        const rows = await dbGetByDate(chatId, date);

        if (!rows.length) {
          await bot.sendMessage(chatId, `Записів за ${date} немає`);
          return res.send("ok");
        }

        const excelBuffer = await createExcelFile(rows, date);

        await bot.sendDocument(
          chatId,
          excelBuffer,
          {},
          {
            filename: `day-${date}.xlsx`,
            contentType:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }
        );

        return res.send("ok");
      }
    }

    res.send("ok");
  } catch (e) {
    console.error("TG ERROR:", e);
    res.status(200).send("error");
  }
}

// ---------- допоміжні ----------
function genMonths(year) {
  return Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, "0");
    return [{ text: mm, callback_data: `month_${year}_${mm}` }];
  });
}

function genDays(y, m) {
  return Array.from({ length: 31 }, (_, i) => {
    const dd = String(i + 1).padStart(2, "0");
    return [{ text: dd, callback_data: `day_${y}_${m}_${dd}` }];
  });
}

// Безпечний парсер JSON, щоб бот не падав, якщо GPT раптом поверне не те
function parseJsonArraySafe(str) {
  try {
    const data = JSON.parse(str);
    if (Array.isArray(data)) return data;
    console.warn("analyzeDay result is not array:", data);
  } catch (e) {
    console.error("JSON parse error (analyzeDay):", e);
  }
  return [];
}
