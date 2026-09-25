import { downloadInvoice } from "./actions";

export async function fetchInvoiceFile(orderId: number): Promise<File | null> {
  const result = await downloadInvoice(orderId);
  if (!result.ok) return null;
  const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
  return new File([bytes], `nakladnaya-${orderId}.pdf`, { type: "application/pdf" });
}
