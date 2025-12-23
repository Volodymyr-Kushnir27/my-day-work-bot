// lib/db.js
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ЗБЕРЕГТИ ДЕНЬ
export async function dbSaveDay(data) {
  const { error } = await supabase.from("days").insert({
    telegram_id: data.telegram_id,
    date: data.date,
    raw_text: data.raw,
    gpt_result: data.gpt,
    audio_text: data.audio_text || null,
  });

  if (error) {
    console.error("Supabase insert error:", error);
    throw error;
  }
}

// ОТРИМАТИ ДАНІ ЗА ДЕНЬ
export async function dbGetByDate(telegram_id, date) {
  const { data, error } = await supabase
    .from("days")
    .select("*")
    .eq("telegram_id", telegram_id)
    .eq("date", date)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Supabase query error:", error);
    throw error;
  }

  return data || [];
} 
 