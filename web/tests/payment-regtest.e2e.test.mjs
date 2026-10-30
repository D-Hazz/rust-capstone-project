import assert from "node:assert/strict";
import test from "node:test";

const baseUrl = process.env.PAYMENT_TEST_BASE_URL || "http://127.0.0.1:3000";
const rpcUrl = process.env.BITCOIN_RPC_URL || "http://127.0.0.1:18443";
const rpcUser = process.env.BITCOIN_RPC_USER || "alice";
const rpcPassword =
  process.env.BITCOIN_RPC_PASS ||
  process.env.BITCOIN_RPC_PASSWORD ||
  "password";
const timeout = 180_000;

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeout),
  });
  const result = await response.json();
  return { response, result };
}

async function paymentAction(action, payload = {}) {
  const { response, result } = await postJson(`${baseUrl}/api/payments`, { action, payload });
  assert.equal(response.ok, true, `${action}: ${result.error || response.status}`);
  return result;
}

async function mine(count = 1) {
  const { response, result } = await postJson(`${baseUrl}/api/bitcoin`, {
    action: "generate_blocks",
    payload: { count },
  });
  assert.equal(response.ok, true, result.error || "Block mining failed");
}

async function refreshInvoice(invoiceId) {
  return paymentAction("invoice_status", { invoiceId });
}

async function createInvoice({
  amountFiat = 5,
  expiresInMinutes = 30,
  requiredConfirmations = 1,
} = {}) {
  const result = await paymentAction("create_invoice", {
    currency: "USD",
    amountFiat,
    expiresInMinutes,
    requiredConfirmations,
  });
  return result.invoice;
}

async function waitForStatus(invoiceId, expected, maxAttempts = 20) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const result = await refreshInvoice(invoiceId);
    if (result.invoice.status === expected) return result;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.fail(`Invoice ${invoiceId} did not reach ${expected}`);
}

test("regtest payment lifecycle persists, confirms, settles and expires invoices", {
  timeout,
}, async (t) => {
  const nodeResponse = await fetch(`${baseUrl}/api/bitcoin`, { signal: AbortSignal.timeout(10_000) });
  assert.equal(nodeResponse.ok, true, "Start the dashboard and Bitcoin regtest first");
  const node = await nodeResponse.json();
  assert.equal(node.chain, "regtest");

  const savedInvoices = await fetch(`${baseUrl}/api/payments?invoices=1`);
  assert.equal(savedInvoices.ok, true);

  await t.test("partial payment, top-up and confirmed settlement", async () => {
    const invoice = await createInvoice({ amountFiat: 10, requiredConfirmations: 2 });
    const partialAmount = Math.floor(invoice.amountSats / 2) / 100_000_000;
    await paymentAction("send_test_payment", { invoiceId: invoice.invoiceId, amountBtc: partialAmount });
    let status = await refreshInvoice(invoice.invoiceId);
    assert.equal(status.invoice.status, "partial");
    assert.ok(status.invoice.shortfallSats > 0);

    await paymentAction("send_test_payment", {
      invoiceId: invoice.invoiceId,
      amountBtc: status.invoice.shortfallSats / 100_000_000,
    });
    await mine(1);
    status = await refreshInvoice(invoice.invoiceId);
    assert.equal(status.invoice.status, "pending");
    const prematureSettlement = await postJson(`${baseUrl}/api/payments`, {
      action: "settle_invoice",
      payload: { invoiceId: invoice.invoiceId },
    });
    assert.equal(prematureSettlement.response.status, 409);
    await mine(1);
    status = await waitForStatus(invoice.invoiceId, "confirmed");

    const settlement = await paymentAction("settle_invoice", { invoiceId: invoice.invoiceId });
    assert.equal(settlement.invoice.status, "settlement_pending");
    assert.ok(settlement.txid);
    const duplicate = await postJson(`${baseUrl}/api/payments`, {
      action: "settle_invoice",
      payload: { invoiceId: invoice.invoiceId },
    });
    assert.equal(duplicate.response.status, 409);

    await mine(2);
    status = await waitForStatus(invoice.invoiceId, "settlement_confirmed");
    assert.equal(status.invoice.status, "settlement_confirmed");
  });

  await t.test("overpayments are detected and included in settlement", async () => {
    const invoice = await createInvoice({ amountFiat: 5 });
    const excessSats = 10_000;
    await paymentAction("send_test_payment", {
      invoiceId: invoice.invoiceId,
      amountBtc: (invoice.amountSats + excessSats) / 100_000_000,
    });
    await mine(1);
    const status = await waitForStatus(invoice.invoiceId, "overpaid");
    assert.equal(status.invoice.excessSats, excessSats);
    const settlement = await paymentAction("settle_invoice", { invoiceId: invoice.invoiceId });
    assert.equal(settlement.invoice.status, "settlement_pending");
    assert.equal(settlement.grossSats, invoice.amountSats + excessSats);
    await mine(1);
    await waitForStatus(invoice.invoiceId, "settlement_confirmed");
  });

  await t.test("expiry and validation are persisted", async () => {
    const invoice = await createInvoice({ amountFiat: 5, expiresInMinutes: 1 });
    const invalid = await postJson(`${baseUrl}/api/payments`, {
      action: "create_invoice",
      payload: { currency: "USD", amountFiat: 5, requiredConfirmations: 0 },
    });
    assert.equal(invalid.response.status, 400);
    await new Promise((resolve) => setTimeout(resolve, 61_000));
    const expired = await refreshInvoice(invoice.invoiceId);
    assert.equal(expired.invoice.status, "expired");

    const persisted = await fetch(`${baseUrl}/api/payments?invoices=1`);
    const result = await persisted.json();
    assert.equal(result.invoices.some((item) => item.invoiceId === invoice.invoiceId), true);
  });
});

test("Bitcoin RPC is reachable for this integration suite", {
  skip: process.env.SKIP_PAYMENT_RPC_CHECK === "1",
}, async () => {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain",
      Authorization: `Basic ${Buffer.from(`${rpcUser}:${rpcPassword}`).toString("base64")}`,
    },
    body: JSON.stringify({ jsonrpc: "1.0", id: "payment-tests", method: "getblockchaininfo", params: [] }),
    signal: AbortSignal.timeout(10_000),
  });
  assert.equal(response.ok, true);
  const result = await response.json();
  assert.equal(result.result.chain, "regtest");
});
