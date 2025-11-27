// lib/gpt.js
import OpenAI from "openai";
import { File } from "node:buffer";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ---------------- GPT короткі відповіді ----------------
export async function askGPT(text) {
  const r = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: "Ти дружній асистент, відповідай коротко." },
      { role: "user", content: text }
    ]
  });

  return r.choices[0].message.content;
}

// ---------------- АУДІО → ТЕКСТ (Whisper) ----------------
export async function transcribeAudio(buffer) {
  const file = new File([buffer], "voice.ogg", { type: "audio/ogg" });

  const result = await openai.audio.transcriptions.create({
    file,
    model: "gpt-4o-transcribe"
  });

  return result.text;
}

// ---------------- АНАЛІЗ ДНЯ GPT ----------------
export async function analyzeDay(raw) {
  const r = await openai.chat.completions.create({
    model: "gpt-4.1-mini",
    messages: [
      { role: "system", content: "Ти асистент-коуч." },
      {
        role: "user",
        content: `
Ось опис дня:
"${raw}"

Зроби аналіз по категоріях: спорт, робота, навчання, сім'я, відпочинок.
Додай по 1 пораді.
`
      }
    ]
  });

  return r.choices[0].message.content;
}
