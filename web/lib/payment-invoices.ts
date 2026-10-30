import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type InvoiceStatus =
  | "open"
  | "partial"
  | "pending"
  | "confirmed"
  | "overpaid"
  | "expired"
  | "settlement_pending"
  | "settlement_confirmed"
  | "settlement_failed";

export interface PaymentInvoice {
  invoiceId: string;
  address: string;
  label: string;
  currency: "CDF" | "USD" | "EUR";
  amountFiat: number;
  amountSats: number;
  amountBtc: number;
  currencyPerBtc: number;
  rateUpdatedAt: string;
  createdAt: string;
  expiresAt: string;
  requiredConfirmations: number;
  status: InvoiceStatus;
  paymentTxid: string | null;
  paymentDispatchAt: string | null;
  receivedSats: number;
  confirmedSats: number;
  settlementTxid: string | null;
  settlementError: string | null;
  updatedAt: string;
}

interface InvoiceRow {
  invoice_id: string;
  address: string;
  label: string;
  currency: PaymentInvoice["currency"];
  amount_fiat: number;
  amount_sats: number;
  currency_per_btc: number;
  rate_updated_at: string;
  created_at: string;
  expires_at: string;
  required_confirmations: number;
  status: InvoiceStatus;
  payment_txid: string | null;
  payment_dispatch_at: string | null;
  received_sats: number;
  confirmed_sats: number;
  settlement_txid: string | null;
  settlement_error: string | null;
  updated_at: string;
}

const databasePath =
  process.env.PAYMENT_DATABASE_PATH || join(process.cwd(), ".data", "payment-invoices.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });

const database = new DatabaseSync(databasePath);
database.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
database.exec(`
  CREATE TABLE IF NOT EXISTS payment_invoices (
    invoice_id TEXT PRIMARY KEY,
    address TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    currency TEXT NOT NULL CHECK (currency IN ('CDF', 'USD', 'EUR')),
    amount_fiat REAL NOT NULL CHECK (amount_fiat > 0),
    amount_sats INTEGER NOT NULL CHECK (amount_sats > 0),
    currency_per_btc REAL NOT NULL CHECK (currency_per_btc > 0),
    rate_updated_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    required_confirmations INTEGER NOT NULL CHECK (required_confirmations BETWEEN 1 AND 12),
    status TEXT NOT NULL,
    received_sats INTEGER NOT NULL DEFAULT 0,
    confirmed_sats INTEGER NOT NULL DEFAULT 0,
    settlement_txid TEXT,
    settlement_error TEXT,
    payment_txid TEXT,
    payment_dispatch_at TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS payment_invoices_created_at ON payment_invoices(created_at DESC);
`);
const invoiceColumns = database.prepare("PRAGMA table_info(payment_invoices)").all() as Array<{ name: string }>;
if (!invoiceColumns.some(({ name }) => name === "payment_txid")) {
  database.exec("ALTER TABLE payment_invoices ADD COLUMN payment_txid TEXT");
}
if (!invoiceColumns.some(({ name }) => name === "payment_dispatch_at")) {
  database.exec("ALTER TABLE payment_invoices ADD COLUMN payment_dispatch_at TEXT");
}

function fromRow(row: InvoiceRow): PaymentInvoice {
  return {
    invoiceId: row.invoice_id,
    address: row.address,
    label: row.label,
    currency: row.currency,
    amountFiat: row.amount_fiat,
    amountSats: row.amount_sats,
    amountBtc: row.amount_sats / 100_000_000,
    currencyPerBtc: row.currency_per_btc,
    rateUpdatedAt: row.rate_updated_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    requiredConfirmations: row.required_confirmations,
    status: row.status,
    paymentTxid: row.payment_txid ?? null,
    paymentDispatchAt: row.payment_dispatch_at ?? null,
    receivedSats: row.received_sats,
    confirmedSats: row.confirmed_sats,
    settlementTxid: row.settlement_txid,
    settlementError: row.settlement_error,
    updatedAt: row.updated_at,
  };
}

export function createPaymentInvoice(invoice: Omit<PaymentInvoice,
  | "status"
  | "paymentTxid"
  | "paymentDispatchAt"
  | "receivedSats"
  | "confirmedSats"
  | "settlementTxid"
  | "settlementError"
  | "updatedAt"
>): PaymentInvoice {
  const now = new Date().toISOString();
  database.prepare(`
    INSERT INTO payment_invoices (
      invoice_id, address, label, currency, amount_fiat, amount_sats,
      currency_per_btc, rate_updated_at, created_at, expires_at,
      required_confirmations, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
  `).run(
    invoice.invoiceId,
    invoice.address,
    invoice.label,
    invoice.currency,
    invoice.amountFiat,
    invoice.amountSats,
    invoice.currencyPerBtc,
    invoice.rateUpdatedAt,
    invoice.createdAt,
    invoice.expiresAt,
    invoice.requiredConfirmations,
    now,
  );
  return getPaymentInvoice(invoice.invoiceId)!;
}

export function getPaymentInvoice(invoiceId: string): PaymentInvoice | null {
  const row = database.prepare("SELECT * FROM payment_invoices WHERE invoice_id = ?").get(invoiceId) as
    | InvoiceRow
    | undefined;
  return row ? fromRow(row) : null;
}

export function getPaymentInvoiceByAddress(address: string): PaymentInvoice | null {
  const row = database.prepare("SELECT * FROM payment_invoices WHERE address = ?").get(address) as
    | InvoiceRow
    | undefined;
  return row ? fromRow(row) : null;
}

export function listPaymentInvoices(limit = 100): PaymentInvoice[] {
  const rows = database.prepare(
    "SELECT * FROM payment_invoices ORDER BY created_at DESC LIMIT ?",
  ).all(limit) as unknown as InvoiceRow[];
  return rows.map(fromRow);
}

export function updateInvoiceObservation(
  invoiceId: string,
  observation: { receivedSats: number; confirmedSats: number; status: InvoiceStatus },
): PaymentInvoice | null {
  const result = database.prepare(`
    UPDATE payment_invoices
    SET received_sats = ?, confirmed_sats = ?, status = ?,
        payment_dispatch_at = CASE WHEN ? > 0 THEN NULL ELSE payment_dispatch_at END,
        updated_at = ?
    WHERE invoice_id = ?
      AND status NOT IN ('settlement_pending', 'settlement_confirmed')
  `).run(
    observation.receivedSats,
    observation.confirmedSats,
    observation.status,
    observation.receivedSats,
    new Date().toISOString(),
    invoiceId,
  );
  if (result.changes === 0) {
    const invoice = getPaymentInvoice(invoiceId);
    if (!invoice) return null;
    if (invoice.status === "settlement_pending" || invoice.status === "settlement_confirmed") return invoice;
  }
  return getPaymentInvoice(invoiceId);
}

export function markInvoicePaymentBroadcast(invoiceId: string, txid: string): PaymentInvoice | null {
  const result = database.prepare(`
    UPDATE payment_invoices
    SET payment_txid = COALESCE(payment_txid, ?),
        payment_dispatch_at = NULL,
        status = 'pending',
        updated_at = ?
    WHERE invoice_id = ?
      AND (payment_dispatch_at IS NOT NULL OR received_sats > 0)
  `).run(txid, new Date().toISOString(), invoiceId);
  return result.changes === 1 ? getPaymentInvoice(invoiceId) : null;
}

export function reserveInvoiceTestPayment(invoiceId: string): PaymentInvoice | null {
  const now = new Date().toISOString();
  const result = database.prepare(`
    UPDATE payment_invoices
    SET payment_dispatch_at = ?, status = 'pending', updated_at = ?
    WHERE invoice_id = ?
      AND status IN ('open', 'partial')
      AND payment_dispatch_at IS NULL
  `).run(now, now, invoiceId);
  return result.changes === 1 ? getPaymentInvoice(invoiceId) : null;
}

export function releaseInvoiceTestPayment(invoiceId: string, status: InvoiceStatus): PaymentInvoice | null {
  database.prepare(`
    UPDATE payment_invoices
    SET payment_dispatch_at = NULL, status = ?, updated_at = ?
    WHERE invoice_id = ? AND payment_dispatch_at IS NOT NULL
  `).run(status, new Date().toISOString(), invoiceId);
  return getPaymentInvoice(invoiceId);
}

export function recoverStaleTestPaymentReservation(invoiceId: string): PaymentInvoice | null {
  database.prepare(`
    UPDATE payment_invoices
    SET payment_dispatch_at = NULL,
        status = CASE WHEN received_sats > 0 THEN 'partial' ELSE 'open' END,
        updated_at = ?
    WHERE invoice_id = ?
      AND payment_dispatch_at IS NOT NULL
      AND payment_dispatch_at < ?
  `).run(
    new Date().toISOString(),
    invoiceId,
    new Date(Date.now() - 5 * 60_000).toISOString(),
  );
  return getPaymentInvoice(invoiceId);
}

export function reserveInvoiceSettlement(invoiceId: string): PaymentInvoice | null {
  const result = database.prepare(`
    UPDATE payment_invoices
    SET status = 'settlement_pending', settlement_error = NULL, updated_at = ?
    WHERE invoice_id = ?
      AND status IN ('confirmed', 'overpaid', 'settlement_failed')
      AND settlement_txid IS NULL
  `).run(new Date().toISOString(), invoiceId);
  return result.changes === 1 ? getPaymentInvoice(invoiceId) : null;
}

export function recoverStaleSettlementReservation(invoiceId: string): PaymentInvoice | null {
  database.prepare(`
    UPDATE payment_invoices
    SET status = 'settlement_failed',
        settlement_error = 'Réservation de règlement expirée avant diffusion.',
        updated_at = ?
    WHERE invoice_id = ?
      AND status = 'settlement_pending'
      AND settlement_txid IS NULL
      AND updated_at < ?
  `).run(
    new Date().toISOString(),
    invoiceId,
    new Date(Date.now() - 5 * 60_000).toISOString(),
  );
  return getPaymentInvoice(invoiceId);
}

export function markSettlementBroadcast(invoiceId: string, txid: string): PaymentInvoice | null {
  database.prepare(`
    UPDATE payment_invoices
    SET settlement_txid = ?, settlement_error = NULL, status = 'settlement_pending', updated_at = ?
    WHERE invoice_id = ? AND status = 'settlement_pending'
  `).run(txid, new Date().toISOString(), invoiceId);
  return getPaymentInvoice(invoiceId);
}

export function markSettlementFailed(invoiceId: string, error: string): PaymentInvoice | null {
  database.prepare(`
    UPDATE payment_invoices
    SET status = 'settlement_failed', settlement_error = ?, updated_at = ?
    WHERE invoice_id = ? AND status = 'settlement_pending' AND settlement_txid IS NULL
  `).run(error.slice(0, 500), new Date().toISOString(), invoiceId);
  return getPaymentInvoice(invoiceId);
}

export function updateSettlementConfirmation(
  invoiceId: string,
  status: "settlement_pending" | "settlement_confirmed" | "settlement_failed",
  error?: string,
): PaymentInvoice | null {
  database.prepare(`
    UPDATE payment_invoices
    SET status = ?, settlement_error = ?, updated_at = ?
    WHERE invoice_id = ? AND settlement_txid IS NOT NULL
  `).run(status, error?.slice(0, 500) ?? null, new Date().toISOString(), invoiceId);
  return getPaymentInvoice(invoiceId);
}
