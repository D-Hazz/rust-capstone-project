import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "regtest-payment-tests-"));
process.env.PAYMENT_DATABASE_PATH = join(temporaryDirectory, "invoices.sqlite");

const { getPaymentStatus } = await import("../lib/payment-lifecycle.ts");
const invoices = await import("../lib/payment-invoices.ts");
const now = Date.parse("2026-01-01T00:00:00.000Z");
const shared = {
  amountSats: 100_000,
  expiresAt: new Date(now + 60_000).toISOString(),
  now,
};

test("payment status represents open, partial, pending, confirmed and overpaid", () => {
  assert.equal(getPaymentStatus({ ...shared, receivedSats: 0, confirmedSats: 0 }), "open");
  assert.equal(getPaymentStatus({ ...shared, receivedSats: 50_000, confirmedSats: 0 }), "partial");
  assert.equal(getPaymentStatus({ ...shared, receivedSats: 100_000, confirmedSats: 0 }), "pending");
  assert.equal(getPaymentStatus({ ...shared, receivedSats: 100_000, confirmedSats: 100_000 }), "confirmed");
  assert.equal(getPaymentStatus({ ...shared, receivedSats: 120_000, confirmedSats: 100_000 }), "overpaid");
});

test("expired invoices preserve payment observations and distinguish paid invoices", () => {
  const expiredAt = new Date(now - 1).toISOString();
  assert.equal(
    getPaymentStatus({ ...shared, expiresAt: expiredAt, receivedSats: 30_000, confirmedSats: 30_000 }),
    "expired",
  );
  assert.equal(
    getPaymentStatus({ ...shared, expiresAt: expiredAt, receivedSats: 100_000, confirmedSats: 100_000 }),
    "confirmed",
  );
});

test("SQLite persists invoices and permits only one settlement reservation", () => {
  const invoice = invoices.createPaymentInvoice({
    invoiceId: "test-invoice",
    address: "bcrt1qexampleaddress00000000000000000000000000",
    label: "test-invoice",
    currency: "USD",
    amountFiat: 10,
    amountSats: 100_000,
    amountBtc: 0.001,
    currencyPerBtc: 10_000,
    rateUpdatedAt: new Date(now).toISOString(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    requiredConfirmations: 1,
  });
  assert.equal(invoice.status, "open");
  assert.equal(invoices.getPaymentInvoice("test-invoice")?.address, invoice.address);
  assert.equal(invoices.listPaymentInvoices().some(({ invoiceId }) => invoiceId === invoice.invoiceId), true);
  assert.equal(invoices.reserveInvoiceTestPayment(invoice.invoiceId)?.status, "pending");
  assert.notEqual(invoices.getPaymentInvoice(invoice.invoiceId)?.paymentDispatchAt, null);
  assert.equal(invoices.reserveInvoiceTestPayment(invoice.invoiceId), null);
  assert.equal(
    invoices.markInvoicePaymentBroadcast(invoice.invoiceId, "a".repeat(64))?.paymentTxid,
    "a".repeat(64),
  );
  assert.equal(invoices.getPaymentInvoice(invoice.invoiceId)?.paymentDispatchAt, null);

  invoices.updateInvoiceObservation(invoice.invoiceId, {
    receivedSats: 120_000,
    confirmedSats: 120_000,
    status: "overpaid",
  });
  assert.equal(invoices.reserveInvoiceSettlement(invoice.invoiceId)?.status, "settlement_pending");
  assert.equal(invoices.reserveInvoiceSettlement(invoice.invoiceId), null);
  assert.equal(invoices.markSettlementBroadcast(invoice.invoiceId, "f".repeat(64))?.settlementTxid, "f".repeat(64));
  assert.equal(
    invoices.updateSettlementConfirmation(invoice.invoiceId, "settlement_confirmed")?.status,
    "settlement_confirmed",
  );
});

test("a failed, undispatched settlement can be retried", () => {
  const invoice = invoices.createPaymentInvoice({
    invoiceId: "retry-invoice",
    address: "bcrt1qretryinvoice0000000000000000000000000000",
    label: "retry-invoice",
    currency: "EUR",
    amountFiat: 10,
    amountSats: 100_000,
    amountBtc: 0.001,
    currencyPerBtc: 10_000,
    rateUpdatedAt: new Date(now).toISOString(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60_000).toISOString(),
    requiredConfirmations: 1,
  });
  invoices.updateInvoiceObservation(invoice.invoiceId, {
    receivedSats: 100_000,
    confirmedSats: 100_000,
    status: "confirmed",
  });
  invoices.reserveInvoiceSettlement(invoice.invoiceId);
  assert.equal(invoices.markSettlementFailed(invoice.invoiceId, "simulated failure")?.status, "settlement_failed");
  assert.equal(invoices.reserveInvoiceSettlement(invoice.invoiceId)?.status, "settlement_pending");
});

test.after(() => {
  rmSync(temporaryDirectory, { recursive: true, force: true });
});
