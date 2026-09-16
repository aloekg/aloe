import "server-only";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

export type InvoiceItem = {
  name: string;
  price: number;
  quantity: number;
};

export type InvoiceData = {
  orderId: string;
  createdAt: Date;
  name: string;
  phone: string;
  address: string;
  comment: string;
  deliveryCost: number;
  items: InvoiceItem[];
  itemsTotal: number;
  total: number;
};

const FONTS_DIR = path.join(process.cwd(), "lib/fonts");

// Read once per process rather than per invoice, and hand pdfkit a Buffer instead of a path.
// `next.config.ts` traces these files into the serverless bundle via outputFileTracingIncludes;
// resolving them lazily here keeps a missing font from breaking module load.
let fonts: { regular: Buffer; bold: Buffer } | null = null;

function loadFonts() {
  if (!fonts) {
    fonts = {
      regular: fs.readFileSync(path.join(FONTS_DIR, "Roboto-Regular.ttf")),
      bold: fs.readFileSync(path.join(FONTS_DIR, "Roboto-Bold.ttf")),
    };
  }
  return fonts;
}

const PAGE_BOTTOM = 780;

export async function generateInvoicePdf(data: InvoiceData): Promise<Buffer> {
  const { regular, bold } = loadFonts();

  // font: false skips pdfkit's default Helvetica setup, which reads an .afm file from
  // disk — that file isn't traced into the Next.js serverless bundle. We register our
  // own (Cyrillic-capable) fonts below instead.
  const doc = new PDFDocument({ size: "A4", margin: 40, font: false as unknown as string });
  doc.registerFont("Regular", regular);
  doc.registerFont("Bold", bold);

  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  doc.font("Bold").fontSize(18).text("Aloe.kg", { continued: false });
  doc.font("Regular").fontSize(10).fillColor("#666").text("aloe.kg  •  noreply@aloe.kg");
  doc.moveDown(1.5);

  doc.font("Bold").fontSize(16).fillColor("#000").text(`Накладная — заказ #${data.orderId}`);
  doc
    .font("Regular")
    .fontSize(10)
    .fillColor("#666")
    .text(
      data.createdAt.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    );
  doc.moveDown(1);

  doc.font("Bold").fontSize(11).fillColor("#000").text("Получатель");
  doc.font("Regular").fontSize(10).fillColor("#333");
  doc.text(`Имя: ${data.name}`);
  doc.text(`Телефон: ${data.phone}`);
  doc.text(`Адрес: ${data.address}`);
  if (data.comment) doc.text(`Комментарий: ${data.comment}`);
  doc.moveDown(1);

  const tableTop = doc.y;
  const col = { name: 40, qty: 320, price: 390, sum: 470 };

  doc.font("Bold").fontSize(10);
  doc.text("Товар", col.name, tableTop);
  doc.text("Кол-во", col.qty, tableTop);
  doc.text("Цена", col.price, tableTop);
  doc.text("Сумма", col.sum, tableTop);
  doc
    .moveTo(40, tableTop + 15)
    .lineTo(555, tableTop + 15)
    .strokeColor("#ccc")
    .stroke();

  let y = tableTop + 22;
  doc.font("Regular").fontSize(10);
  for (const item of data.items) {
    const rowHeight = doc.heightOfString(item.name, { width: 270 }) + 6;
    if (y + rowHeight > PAGE_BOTTOM) {
      doc.addPage();
      y = doc.page.margins.top;
      doc.font("Regular").fontSize(10);
    }
    doc.text(item.name, col.name, y, { width: 270 });
    doc.text(String(item.quantity), col.qty, y);
    doc.text(`${item.price} сом`, col.price, y);
    doc.text(`${item.price * item.quantity} сом`, col.sum, y);
    y += rowHeight;
  }

  // Keep the totals block intact rather than splitting it across the page boundary.
  if (y + 64 > PAGE_BOTTOM) {
    doc.addPage();
    y = doc.page.margins.top;
  }

  doc
    .moveTo(40, y + 4)
    .lineTo(555, y + 4)
    .strokeColor("#ccc")
    .stroke();
  y += 14;

  doc.font("Regular").fontSize(10);
  doc.text("Товары:", col.price, y);
  doc.text(`${data.itemsTotal} сом`, col.sum, y);
  y += 16;
  doc.text("Доставка:", col.price, y);
  doc.text(`${data.deliveryCost} сом`, col.sum, y);
  y += 18;

  doc.font("Bold").fontSize(12);
  doc.text("Итого:", col.price, y);
  doc.text(`${data.total} сом`, col.sum, y);

  doc.end();
  return done;
}
