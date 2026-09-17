import { downloadInvoice } from "./actions";

/**
 * The action hands the invoice back as base64 rather than a URL — it is admin-gated and generated
 * per request, so there is nothing to link to. Both the download button and the share sheet want a
 * real `File`, so the decoding lives here instead of in either of them.
 */
export async function fetchInvoiceFile(orderId: number): Promise<File | null> {
  const result = await downloadInvoice(orderId);
  if (!result.ok) return null;
  const bytes = Uint8Array.from(atob(result.base64), (c) => c.charCodeAt(0));
  return new File([bytes], `nakladnaya-${orderId}.pdf`, { type: "application/pdf" });
}
