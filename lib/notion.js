// lib/db.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase credentials not set');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export async function dbSaveDay({ telegram_id, date, raw, gpt, audio_text }) {
  try {
    const { data, error } = await supabase
      .from('days')
      .insert([
        {
          telegram_id,
          date,
          raw_text: raw,
          gpt_result: gpt,
          audio_text,
          created_at: new Date().toISOString()
        }
      ])
      .select();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('dbSaveDay error:', error);
    throw error;
  }
}

export async function dbGetByDate(telegram_id, date) {
  try {
    const { data, error } = await supabase
      .from('days')
      .select('*')
      .eq('telegram_id', telegram_id)
      .eq('date', date)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('dbGetByDate error:', error);
    return [];
  }
}

// Додаткова функція для отримання всіх записів користувача
export async function dbGetAllDays(telegram_id) {
  try {
    const { data, error } = await supabase
      .from('days')
      .select('*')
      .eq('telegram_id', telegram_id)
      .order('date', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('dbGetAllDays error:', error);
    return [];
  }
}