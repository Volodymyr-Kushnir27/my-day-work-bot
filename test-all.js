// test-all.js
import dotenv from 'dotenv';
dotenv.config();

async function testAll() {
  console.log("🧪 Testing all connections...\n");
  
  // 1. Перевірка змінних оточення
  console.log("🔑 Environment variables:");
  console.log("TELEGRAM_TOKEN:", process.env.TELEGRAM_TOKEN ? "✅ Set" : "❌ Missing");
  console.log("OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "✅ Set" : "❌ Missing");
  console.log("NOTION_TOKEN:", process.env.NOTION_TOKEN ? "✅ Set" : "❌ Missing");
  console.log("NOTION_DATABASE_ID:", process.env.NOTION_DATABASE_ID ? "✅ Set" : "❌ Missing");
  console.log("SUPABASE_URL:", process.env.SUPABASE_URL ? "✅ Set" : "❌ Missing (optional)");
  console.log("SUPABASE_ANON_KEY:", process.env.SUPABASE_ANON_KEY ? "✅ Set" : "❌ Missing (optional)");
  
  // 2. Тестуємо Notion
  console.log("\n🔗 Testing Notion...");
  try {
    const { testNotionConnection } = await import('./lib/notion.js');
    const props = await testNotionConnection();
    if (props) {
      console.log("✅ Notion connection successful");
    }
  } catch (error) {
    console.error("❌ Notion test failed:", error.message);
  }
  
  // 3. Тестуємо Supabase (якщо налаштовано)
  if (process.env.SUPABASE_URL) {
    console.log("\n🗄️ Testing Supabase...");
    try {
      const { dbSaveDay } = await import('./lib/notion.js');
      const testData = {
        telegram_id: "123456",
        date: "2025-12-23",
        raw: "Тестовий запис",
        gpt: '{"test": "data"}',
        audio_text: null
      };
      
      const result = await dbSaveDay(testData);
      if (result) {
        console.log("✅ Supabase connection successful");
      }
    } catch (error) {
      console.error("❌ Supabase test failed:", error.message);
    }
  } else {
    console.log("\n🗄️ Supabase: Skipping (not configured)");
  }
  
  console.log("\n🎉 Testing complete!");
}

testAll();