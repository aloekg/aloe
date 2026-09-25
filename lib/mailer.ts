import "server-only";
import tls from "tls";
import nodemailer from "nodemailer";
import { DEPLOY_ORIGIN } from "@/lib/deploy-origin";
import type { OrderItem } from "@/types";

// SMTP_HOST presents a *.hoster.kg certificate, and Node checks the name against `host`,
// so `servername` alone does nothing; see checkServerIdentity below.
const SMTP_CERT_NAME = process.env.SMTP_TLS_SERVERNAME || "mail.hoster.kg";

// DEPLOY_ORIGIN, not SITE_URL: link to the deployment that took the order.
const ADMIN_ORDERS_URL = `${DEPLOY_ORIGIN}/admin/orders`;

// Order fields come from a public form: always escape.
function esc(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Only http(s) URLs may reach <img src>.
function safeImageUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? esc(url) : "";
}

type NewOrderEmailData = {
  orderId: string;
  name: string;
  phone: string;
  address: string;
  comment: string;
  items: OrderItem[];
  itemsTotal: number;
  deliveryLabel: string;
  deliveryCost: number;
  total: number;
};

function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.error(
      "[mailer] SMTP is not configured — new-order notifications are DISABLED. Missing:",
      [!SMTP_HOST && "SMTP_HOST", !SMTP_PORT && "SMTP_PORT", !SMTP_USER && "SMTP_USER", !SMTP_PASS && "SMTP_PASS"]
        .filter(Boolean)
        .join(", "),
    );
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    // Relaxes only the name binding; rejectUnauthorized stays true, so the CA chain is still verified.
    tls: {
      checkServerIdentity: (_host, cert) => tls.checkServerIdentity(SMTP_CERT_NAME, cert),
    },
  });
}

function renderOrderEmailHtml(data: NewOrderEmailData) {
  const itemsRows = data.items
    .map(
      (i) =>
        `<tr>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #eee;width:48px">` +
        `<img src="${safeImageUrl(i.image_url)}" width="40" height="40" style="object-fit:contain;border:1px solid #eee;border-radius:4px" />` +
        `</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #eee">${esc(i.name)}</td>` +
        `<td style="padding:4px 8px;border-bottom:1px solid #eee;white-space:nowrap">${esc(i.quantity)} × ${esc(i.price)} сом</td></tr>`,
    )
    .join("");

  return `
    <div style="font-family:sans-serif;font-size:14px;color:#111">
      <h2 style="margin:0 0 12px">Новый заказ #${esc(data.orderId)}</h2>
      <p><b>Имя:</b> ${esc(data.name)}<br/>
      <b>Телефон:</b> ${esc(data.phone)}<br/>
      <b>Адрес:</b> ${esc(data.address)}</p>
      ${data.comment ? `<p><b>Комментарий:</b> ${esc(data.comment)}</p>` : ""}
      <p><b>Способ доставки:</b> ${esc(data.deliveryLabel)}</p>
      <table style="border-collapse:collapse;width:100%;margin:12px 0">${itemsRows}</table>
      <p>
        Товары: ${esc(data.itemsTotal)} сом<br/>
        Доставка: ${esc(data.deliveryCost)} сом<br/>
        <b>Итого: ${esc(data.total)} сом</b>
      </p>
      <p><a href="${ADMIN_ORDERS_URL}">Открыть заказ в админке</a></p>
    </div>
  `;
}

export async function sendNewOrderEmail(
  data: NewOrderEmailData,
  invoicePdf?: Buffer,
): Promise<{ sent: boolean; reason?: string }> {
  const transport = getTransport();
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!transport) return { sent: false, reason: "SMTP не настроен" };
  if (!to) {
    console.error("[mailer] ADMIN_NOTIFICATION_EMAIL is not set — nobody is notified about orders");
    return { sent: false, reason: "ADMIN_NOTIFICATION_EMAIL не задан" };
  }

  try {
    await transport.sendMail({
      from: `"Aloe.kg" <${process.env.SMTP_USER}>`,
      to,
      subject: `Новый заказ #${data.orderId} — ${data.total} сом`,
      html: renderOrderEmailHtml(data),
      attachments: invoicePdf
        ? [{ filename: `nakladnaya-${data.orderId}.pdf`, content: invoicePdf, contentType: "application/pdf" }]
        : undefined,
    });
    return { sent: true };
  } catch (err) {
    console.error(`[mailer] failed to send notification for order ${data.orderId}`, err);
    return { sent: false, reason: err instanceof Error ? err.message : String(err) };
  } finally {
    transport.close();
  }
}
