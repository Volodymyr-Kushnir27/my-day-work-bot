// api/telegram.js
import TelegramBot from "node-telegram-bot-api";
import { askGPT, analyzeDay, transcribeAudio } from "../lib/gpt.js";
import { dbSaveDay, dbGetByDate } from "../lib/notion.js"; // Змінено з notion.js на db.js
import { createExcelFile } from "../lib/excel.js";
import { saveObjectsToNotion } from "../lib/notion.js";

export const config = { runtime: "nodejs" };

// Синглтон для бота
let botInstance = null;

function getBot() {
  if (!botInstance) {
    if (!process.env.TELEGRAM_TOKEN) {
      throw new Error("TELEGRAM_TOKEN не налаштовано");
    }
    botInstance = new TelegramBot(process.env.TELEGRAM_TOKEN, { 
      polling: false,
      request: {
        timeout: 30000
      }
    });
  }
  return botInstance;
}

// Rate limiting
const userRequests = new Map();
const USER_REQUEST_DELAY = 1000;
const MAX_AUDIO_SIZE = 20 * 1024 * 1024;
const MAX_TEXT_LENGTH = 4000;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Верифікація (опційно, якщо налаштуєте secret token)
  const secretToken = process.env.TELEGRAM_SECRET_TOKEN;
  if (secretToken && req.headers['x-telegram-bot-api-secret-token'] !== secretToken) {
    console.warn("Invalid secret token");
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const update = req.body;
    
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallback(update.callback_query);
    }
    
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Handler error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

async function handleMessage(message) {
  const bot = getBot();
  const chatId = message.chat.id;
  const userId = message.from?.id;

  // Rate limiting
  if (userId) {
    const now = Date.now();
    const lastRequest = userRequests.get(userId) || 0;
    if (now - lastRequest < USER_REQUEST_DELAY) {
      console.log(`Rate limited: ${userId}`);
      return;
    }
    userRequests.set(userId, now);
  }

  // Аудіо повідомлення
  if (message.voice || message.audio) {
    await handleAudio(bot, message);
    return;
  }

  // Текстове повідомлення
  if (message.text) {
    await handleText(bot, message);
    return;
  }
}

async function handleAudio(bot, message) {
  const chatId = message.chat.id;
  
  try {
    const fileId = message.voice?.file_id || message.audio?.file_id;
    const file = await bot.getFile(fileId);
    const downloadUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_TOKEN}/${file.file_path}`;
    
    // Завантаження аудіо
    const audioResponse = await fetch(downloadUrl);
    const arrayBuffer = await audioResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Перевірка розміру
    if (buffer.length > MAX_AUDIO_SIZE) {
      await bot.sendMessage(chatId, "❌ Аудіо занадто велике (макс. 20MB)");
      return;
    }
    
    await bot.sendChatAction(chatId, 'typing');
    
    // Транскрибація
    const text = await transcribeAudio(buffer);
    console.log("Transcribed text:", text);
    
    if (!text || text.trim().length < 5) {
      await bot.sendMessage(chatId, "❌ Не вдалося розпізнати мову");
      return;
    }
    
    // Аналіз через GPT
    const gptResult = await analyzeDay(text);
    console.log("GPT analysis:", gptResult);
    
    // Збереження в базу даних (Supabase)
    const date = new Date().toISOString().slice(0, 10);
    await dbSaveDay({
      telegram_id: chatId,
      date,
      raw: text,
      gpt: gptResult,
      audio_text: text,
    });
    
    // Збереження в Notion
    const objects = parseJsonArraySafe(gptResult);
    if (objects.length > 0) {
      await saveObjectsToNotion(objects, chatId, text);
    }
    
    // Відповідь користувачу
    const responseText = `✅ Аудіо оброблено!\n\n📝 Текст:\n${text.substring(0, 500)}${text.length > 500 ? '...' : ''}\n\n📊 Знайдено об'єктів: ${objects.length}`;
    await bot.sendMessage(chatId, responseText);
    
  } catch (error) {
    console.error("Audio processing error:", error);
    await bot.sendMessage(chatId, "❌ Помилка обробки аудіо");
  }
}

async function handleText(bot, message) {
  const chatId = message.chat.id;
  const text = message.text.trim();
  
  // Перевірка довжини
  if (text.length > MAX_TEXT_LENGTH) {
    await bot.sendMessage(chatId, "❌ Текст занадто довгий");
    return;
  }
  
  // Команди
  if (text === "/start") {
    await bot.sendMessage(chatId, "👋 Вітаю! Обери дію:", {
      reply_markup: {
        keyboard: [
          [{ text: "❓ Запитання до GPT" }],
          [{ text: "📝 Мій день" }],
          [{ text: "📊 Таблиці" }],
        ],
        resize_keyboard: true,
      },
    });
    return;
  }
  
  if (text === "❓ Запитання до GPT") {
    await bot.sendMessage(chatId, "Задайте ваше запитання:");
    return;
  }
  
  if (text === "📊 Таблиці") {
    const currentYear = new Date().getFullYear();
    await bot.sendMessage(chatId, "Оберіть рік:", {
      reply_markup: {
        inline_keyboard: [
          [{ text: String(currentYear - 1), callback_data: `year_${currentYear - 1}` }],
          [{ text: String(currentYear), callback_data: `year_${currentYear}` }],
          [{ text: String(currentYear + 1), callback_data: `year_${currentYear + 1}` }],
        ],
      },
    });
    return;
  }
  
  // Обробка опису дня
  if (text.toLowerCase().includes("мій день") || text.length > 100) {
    await handleDayDescription(bot, chatId, text);
    return;
  }
  
  // Звичайне запитання до GPT
  const answer = await askGPT(text);
  await bot.sendMessage(chatId, answer);
}

async function handleDayDescription(bot, chatId, text) {
  try {
    await bot.sendChatAction(chatId, 'typing');
    
    // Аналіз через GPT
    const gptResult = await analyzeDay(text);
    
    // Збереження в базу
    const date = new Date().toISOString().slice(0, 10);
    await dbSaveDay({
      telegram_id: chatId,
      date,
      raw: text,
      gpt: gptResult,
      audio_text: null,
    });
    
    // Збереження в Notion
    const objects = parseJsonArraySafe(gptResult);
    if (objects.length > 0) {
      await saveObjectsToNotion(objects, chatId, text);
    }
    
    await bot.sendMessage(
      chatId, 
      `✅ День збережено! Знайдено об'єктів: ${objects.length}`
    );
    
  } catch (error) {
    console.error("Day description error:", error);
    await bot.sendMessage(chatId, "❌ Помилка обробки");
  }
}

async function handleCallback(callbackQuery) {
  const bot = getBot();
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;
  
  await bot.answerCallbackQuery(callbackQuery.id);
  
  if (data.startsWith("year_")) {
    const year = data.split("_")[1];
    const months = [
      ["Січень", "01"], ["Лютий", "02"], ["Березень", "03"],
      ["Квітень", "04"], ["Травень", "05"], ["Червень", "06"],
      ["Липень", "07"], ["Серпень", "08"], ["Вересень", "09"],
      ["Жовтень", "10"], ["Листопад", "11"], ["Грудень", "12"]
    ];
    
    const keyboard = months.map(([name, num]) => [
      { text: name, callback_data: `month_${year}_${num}` }
    ]);
    
    await bot.sendMessage(chatId, `Оберіть місяць ${year}:`, {
      reply_markup: { inline_keyboard: keyboard }
    });
  }
  else if (data.startsWith("month_")) {
    const [_, year, month] = data.split("_");
    
    // Створюємо дні місяця
    const daysInMonth = new Date(year, month, 0).getDate();
    const keyboard = [];
    
    for (let i = 1; i <= daysInMonth; i++) {
      const day = String(i).padStart(2, '0');
      keyboard.push([{ text: day, callback_data: `day_${year}_${month}_${day}` }]);
    }
    
    await bot.sendMessage(chatId, `Оберіть день ${month}.${year}:`, {
      reply_markup: { inline_keyboard: keyboard }
    });
  }
  else if (data.startsWith("day_")) {
    const [_, year, month, day] = data.split("_");
    const date = `${year}-${month}-${day}`;
    
    await bot.sendChatAction(chatId, 'upload_document');
    
    // Отримуємо дані з бази
    const rows = await dbGetByDate(chatId, date);
    
    if (!rows || rows.length === 0) {
      await bot.sendMessage(chatId, `Записів за ${date} не знайдено`);
      return;
    }
    
    // Створюємо Excel
    const excelBuffer = await createExcelFile(rows, date);
    
    // Відправляємо файл
    await bot.sendDocument(
      chatId,
      excelBuffer,
      {},
      {
        filename: `day-${date}.xlsx`,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      }
    );
  }
}

function parseJsonArraySafe(str) {
  try {
    // Шукаємо JSON у тексті
    const jsonMatch = str.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    // Спробуємо парсити весь текст
    return JSON.parse(str);
  } catch (e) {
    console.error("JSON parse error:", e.message);
    console.log("Raw string that failed:", str?.substring(0, 200));
    return [];
  }
}