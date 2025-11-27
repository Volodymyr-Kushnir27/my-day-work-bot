// lib/excel.js
import ExcelJS from "exceljs";

export async function createExcelFile(rows, date) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(`Day ${date}`);

  ws.columns = [
    { header: "Дата", key: "date", width: 15 },
    { header: "Raw текст", key: "raw_text", width: 60 },
    { header: "GPT аналіз", key: "gpt_result", width: 60 },
    { header: "Створено", key: "created_at", width: 22 },
  ];

  for (const r of rows) {
    ws.addRow({
      date: r.date,
      raw_text: r.raw_text,
      gpt_result: r.gpt_result,
      created_at: r.created_at,
    });
  }

  // ExcelJS у Node зазвичай повертає Buffer, але іноді ArrayBuffer
  const out = await wb.xlsx.writeBuffer();

  if (Buffer.isBuffer(out)) {
    return out;              // вже Buffer – все ок
  }

  // якщо це ArrayBuffer / Uint8Array:
  return Buffer.from(out);   // конвертуємо в Buffer
}
