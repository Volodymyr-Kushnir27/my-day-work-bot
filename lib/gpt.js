// lib/gpt.js
import OpenAI from "openai";
import { File } from "node:buffer";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------------- ХЕЛПЕРИ ДАТИ/ЧАСУ ----------------

// Поточна дата й час у Києві, для system-повідомлень
function getNowString() {
  const now = new Date();
  return now.toLocaleString("uk-UA", {
    timeZone: "Europe/Kyiv",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Чи це питання про сьогоднішню дату/число/день
function isDateQuestion(text) {
  const t = text.toLowerCase();

  return (
    /яке сьогодні число/.test(t) ||
    /яка сьогодні дата/.test(t) ||
    /сьогоднішня дата/.test(t) ||
    /сьогодні який день/.test(t) ||
    /який сьогодні день/.test(t)
  );
}

// ---------------- GPT короткі відповіді ----------------
export async function askGPT(text) {
  // 1. Якщо питають про сьогоднішню дату — відповідаємо самі, без GPT
  if (isDateQuestion(text)) {
    const now = new Date();
    const dateStr = now.toLocaleDateString("uk-UA", {
      timeZone: "Europe/Kyiv",
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    return `Сьогодні ${dateStr}.`;
  }

  // 2. Для всього іншого — GPT, але з реальною датою/часом у system
  const nowStr = getNowString();

  const r = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `Зараз ${nowStr} (київський час). Ти дружній асистент, відповідай коротко українською, простою мовою.`,
      },
      { role: "user", content: text },
    ],
  });

  return r.choices[0].message.content;
}

// ---------------- АУДІО → ТЕКСТ (Whisper) ----------------
export async function transcribeAudio(buffer) {
  const file = new File([buffer], "voice.ogg", { type: "audio/ogg" });

  const result = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-transcribe",
  });

  return result.text;
}

// ---------------- АНАЛІЗ ДНЯ GPT ----------------
export async function analyzeDay(raw) {
  // Поточні дата й час за Києвом
  const now = new Date();
  const kyivNow = new Date(
    now.toLocaleString("en-US", { timeZone: "Europe/Kyiv" })
  );

  // Для Excel / Notion: YYYY-MM-DD
  const dateISO = kyivNow.toISOString().slice(0, 10); // напр. "2025-12-22"
  // Для часу: HH:MM
  const timeHM = kyivNow.toTimeString().slice(0, 5); // напр. "10:15"

  const nowStr = kyivNow.toLocaleString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const r = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      {
        role: "system",
        content: `
Ти асистент, який структурує робочі дані монтажника систем відеонагляду.
Зараз ${nowStr} (Київ).

Сьогоднішня дата для JSON-поля "date": ${dateISO}
Час створення запису для JSON-поля "time": ${timeHM}

Твоє завдання:
- Виділити з тексту всі об'єкти, де людина працювала протягом дня.
- Для кожного створити структурований опис.

Формат відповіді СУВОРО у вигляді масиву JSON:
[
  {
    "date": "YYYY-MM-DD",
    "time": "HH:MM",
    "object_name": "назва або тип об'єкту",
    "location": "місто / район / адреса (якщо є)",
    "work_done": "що було зроблено, коротко, але суттєво",
    "workers": ["імена працівників з тексту"],
    "income": число_заробітку_за_цей_об'єкт_якщо_є_в_тексті_інакше_0
  }
]

Важливо:
- У КОЖНОМУ об'єкті став значення
  "date": "${dateISO}" і "time": "${timeHM}".
- Якщо в тексті кілька об'єктів — кожен окремим елементом масиву.
- Якщо немає адреси — пропусти або напиши приблизне місце (якщо є).
- Якщо немає доходу — став 0.
- Не додавай нічого, окрім валідного JSON-масиву.
  Без пояснень, без тексту до або після.
`
      },
      {
        role: "user",
        content: raw
      }
    ]
  });

  return r.choices[0].message.content;
}


