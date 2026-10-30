import type { InvoiceStatus } from "./payment-invoices";

export function getPaymentStatus({
  receivedSats,
  confirmedSats,
  amountSats,
  expiresAt,
  now = Date.now(),
}: {
  receivedSats: number;
  confirmedSats: number;
  amountSats: number;
  expiresAt: string;
  now?: number;
}): InvoiceStatus {
  if (confirmedSats >= amountSats) {
    return receivedSats > amountSats ? "overpaid" : "confirmed";
  }
  if (Date.parse(expiresAt) <= now) return "expired";
  if (receivedSats >= amountSats) return "pending";
  if (receivedSats > 0) return "partial";
  return "open";
}
