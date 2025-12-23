// lib/notion.js
import { Client } from "@notionhq/client";
import { createClient } from '@supabase/supabase-js';

// ================ NOTION ================
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const databaseId = process.env.NOTION_DATABASE_ID;

// ================ SUPABASE ================
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
} else {
  console.warn('⚠️ Supabase credentials not set - skipping database operations');
}

// ================ ФУНКЦІЇ ДЛЯ SUPABASE ================
export async function dbSaveDay({ telegram_id, date, raw, gpt, audio_text }) {
  if (!supabase) {
    console.warn('Supabase not configured, skipping dbSaveDay');
    return null;
  }

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
    console.log('✅ Saved to Supabase:', data);
    return data;
  } catch (error) {
    console.error('❌ dbSaveDay error:', error);
    return null;
  }
}

export async function dbGetByDate(telegram_id, date) {
  if (!supabase) {
    console.warn('Supabase not configured, skipping dbGetByDate');
    return [];
  }

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
    console.error('❌ dbGetByDate error:', error);
    return [];
  }
}

// ================ ФУНКЦІЇ ДЛЯ NOTION ================
export async function saveObjectsToNotion(objects, telegramId, rawText = "") {
  if (!Array.isArray(objects) || objects.length === 0) {
    console.warn("No objects to save to Notion");
    return;
  }

  console.log(`💾 Saving ${objects.length} objects to Notion...`);

  for (const obj of objects) {
    try {
      const {
        date = new Date().toISOString().split('T')[0],
        time = "00:00",
        object_name = "Без назви",
        location = "",
        work_done = "",
        workers = [],
        income = 0
      } = obj;

      console.log(`📝 Processing for Notion: ${object_name}`);

      // Ось потрібно використовувати ТОЧНІ назви властивостей з вашої Notion бази!
      // На скріншоті ви бачите: Object name, Date, Time, Telegram ID, Location, Work done, Workers, Income, Raw text
      const properties = {
        // 1. Назва об'єкта
        "Object name": {
          title: [
            {
              type: "text",
              text: { content: object_name }
            }
          ]
        },

        // 2. Дата
        "Date": {
          date: {
            start: date
          }
        },

        // 3. Час
        "Time": {
          rich_text: [
            {
              type: "text",
              text: { content: time }
            }
          ]
        },

        // 4. Telegram ID
        "Telegram ID": {
          rich_text: [
            {
              type: "text",
              text: { content: String(telegramId) }
            }
          ]
        },

        // 5. Location
        "Location": {
          rich_text: [
            {
              type: "text",
              text: { content: location || "Не вказано" }
            }
          ]
        },

        // 6. Work done
        "Work done": {
          rich_text: [
            {
              type: "text",
              text: { content: work_done || "Не вказано" }
            }
          ]
        },

        // 7. Workers
        "Workers": {
          rich_text: [
            {
              type: "text",
              text: { 
                content: Array.isArray(workers) 
                  ? workers.join(", ") 
                  : String(workers) || "Не вказано"
              }
            }
          ]
        },

        // 8. Income
        "Income": {
          number: typeof income === 'number' ? income : 0
        },

        // 9. Raw text
        "Raw text": {
          rich_text: [
            {
              type: "text",
              text: { 
                content: rawText 
                  ? rawText.substring(0, 2000) 
                  : "Немає тексту"
              }
            }
          ]
        }
      };

      const response = await notion.pages.create({
        parent: {
          database_id: databaseId,
          type: "database_id"
        },
        properties: properties
      });

      console.log(`✅ Saved to Notion: ${object_name}`);

    } catch (error) {
      console.error("❌ Error saving to Notion:", error.message);
      // Не зупиняємо весь процес через одну помилку
    }
  }
}

// ================ ТЕСТУВАННЯ NOTION ================
export async function testNotionConnection() {
  try {
    console.log("🔗 Testing Notion connection...");
    
    if (!databaseId) {
      console.error("❌ NOTION_DATABASE_ID not set");
      return null;
    }
    
    const database = await notion.databases.retrieve({
      database_id: databaseId,
    });
    
    console.log("✅ Connected to Notion database:", database.title[0]?.plain_text || "Untitled");
    
    console.log("📋 Available properties:");
    Object.entries(database.properties).forEach(([key, prop]) => {
      console.log(`  - "${prop.name}" (${prop.type}) [ID: ${key}]`);
    });
    
    return database.properties;
  } catch (error) {
    console.error("❌ Notion connection failed:", error.message);
    return null;
  }
}