import { NextResponse } from "next/server";
import { bitcoinRpc, BitcoinRpcError } from "@/lib/bitcoin-rpc";
import { ensureDashboardWallets } from "@/lib/bitcoin-wallets";
import {
  createPaymentInvoice,
  getPaymentInvoice,
  listPaymentInvoices,
  markInvoicePaymentBroadcast,
  markSettlementBroadcast,
  markSettlementFailed,
  recoverStaleTestPaymentReservation,
  recoverStaleSettlementReservation,
  releaseInvoiceTestPayment,
  reserveInvoiceTestPayment,
  reserveInvoiceSettlement,
  updateInvoiceObservation,
  updateSettlementConfirmation,
  type InvoiceStatus,
  type PaymentInvoice,
} from "@/lib/payment-invoices";
import { getPaymentStatus } from "@/lib/payment-lifecycle";

const CURRENCIES = ["CDF", "USD", "EUR"] as const;
type Currency = (typeof CURRENCIES)[number];
type PaymentAction =
  | "quote"
  | "create_invoice"
  | "invoice_status"
  | "send_test_payment"
  | "settle_invoice";

interface FxRates {
  btcUsd: number;
  fiatPerUsd: Record<Currency, number>;
  updatedAt: string;
}

interface AddressInfo {
  ismine: boolean;
}

interface WalletUtxo {
  amount: number;
  address?: string;
}

interface WalletTransaction {
  confirmations: number;
}

class PaymentRequestError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = "PaymentRequestError";
  }
}

async function getFxRates(): Promise<FxRates> {
  const [bitcoinResponse, fiatResponse] = await Promise.all([
    fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot", {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    }),
    fetch("https://open.er-api.com/v6/latest/USD", {
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    }),
  ]);
  if (!bitcoinResponse.ok || !fiatResponse.ok) {
    throw new PaymentRequestError("Le fournisseur de taux de change est indisponible.", 502);
  }

  const bitcoinData: { data?: { amount?: string } } = await bitcoinResponse.json();
  const fiatData: { result?: string; rates?: Partial<Record<Currency, number>> } =
    await fiatResponse.json();
  const btcUsd = Number(bitcoinData.data?.amount);
  const fiatPerUsd = {
    CDF: fiatData.rates?.CDF,
    USD: 1,
    EUR: fiatData.rates?.EUR,
  };
  if (
    !Number.isFinite(btcUsd) ||
    btcUsd <= 0 ||
    fiatData.result !== "success" ||
    CURRENCIES.some((currency) => !Number.isFinite(fiatPerUsd[currency]) || fiatPerUsd[currency]! <= 0)
  ) {
    throw new PaymentRequestError("Réponse de taux de change invalide.", 502);
  }
  return {
    btcUsd,
    fiatPerUsd: fiatPerUsd as Record<Currency, number>,
    updatedAt: new Date().toISOString(),
  };
}

function parseCurrency(value: unknown): Currency {
  if (typeof value !== "string" || !CURRENCIES.includes(value as Currency)) {
    throw new PaymentRequestError("Devise prise en charge : CDF, USD ou EUR.");
  }
  return value as Currency;
}

function parsePositiveAmount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 1_000_000_000) {
    throw new PaymentRequestError(`${label} doit être un nombre positif valide.`);
  }
  return value;
}

function fiatToSats(fiatAmount: number, rates: FxRates, currency: Currency): number {
  const rawSats = (fiatAmount / (rates.btcUsd * rates.fiatPerUsd[currency])) * 100_000_000;
  const amountSats = Math.ceil(rawSats);
  if (!Number.isSafeInteger(amountSats) || amountSats < 1) {
    throw new PaymentRequestError("Le montant est trop faible ou trop élevé pour être représenté en satoshis.");
  }
  return amountSats;
}

function btcToSats(amountBtc: number): number {
  return Math.round(amountBtc * 100_000_000);
}

async function requireRegtest(): Promise<void> {
  const { chain } = await bitcoinRpc<{ chain: string }>("getblockchaininfo");
  if (chain !== "regtest") {
    throw new PaymentRequestError("Les opérations de paiement sont limitées au réseau regtest.", 403);
  }
}

async function requireTraderAddress(address: unknown): Promise<string> {
  if (typeof address !== "string" || address.length < 14 || address.length > 90) {
    throw new PaymentRequestError("Adresse regtest invalide.");
  }
  const info = await bitcoinRpc<AddressInfo>("getaddressinfo", [address], "Trader");
  if (!info.ismine) {
    throw new PaymentRequestError("Cette adresse ne correspond pas au wallet Trader.");
  }
  return address;
}

function serializeInvoice(invoice: PaymentInvoice) {
  return {
    ...invoice,
    amountBtc: invoice.amountSats / 100_000_000,
    receivedBtc: invoice.receivedSats / 100_000_000,
    confirmedBtc: invoice.confirmedSats / 100_000_000,
    shortfallSats: Math.max(invoice.amountSats - invoice.receivedSats, 0),
    excessSats: Math.max(invoice.receivedSats - invoice.amountSats, 0),
  };
}

async function reconcileInvoice(invoice: PaymentInvoice) {
  if (invoice.settlementTxid) {
    const tx = await bitcoinRpc<WalletTransaction>(
      "gettransaction",
      [invoice.settlementTxid, true],
      "Miner",
    );
    const status: InvoiceStatus =
      tx.confirmations < 0
        ? "settlement_failed"
        : tx.confirmations > 0
          ? "settlement_confirmed"
          : "settlement_pending";
    const updated = updateSettlementConfirmation(invoice.invoiceId, status);
    if (!updated) throw new Error("La facture n’a pas pu être mise à jour.");
    return updated;
  }

  const [receivedBtc, confirmedBtc] = await Promise.all([
    bitcoinRpc<number>("getreceivedbyaddress", [invoice.address, 0], "Trader"),
    bitcoinRpc<number>(
      "getreceivedbyaddress",
      [invoice.address, invoice.requiredConfirmations],
      "Trader",
    ),
  ]);
  const receivedSats = btcToSats(receivedBtc);
  const confirmedSats = btcToSats(confirmedBtc);
  const observedStatus = getPaymentStatus({
    receivedSats,
    confirmedSats,
    amountSats: invoice.amountSats,
    expiresAt: invoice.expiresAt,
  });
  const status = invoice.paymentTxid && receivedSats === 0 && observedStatus === "open"
    ? "pending"
    : invoice.paymentDispatchAt && receivedSats === 0
      ? "pending"
      : observedStatus;
  const updated = updateInvoiceObservation(invoice.invoiceId, { receivedSats, confirmedSats, status });
  if (!updated) throw new Error("La facture n’a pas pu être mise à jour.");
  return updated;
}

function errorResponse(error: unknown) {
  if (error instanceof PaymentRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Erreur de paiement inconnue.";
  return NextResponse.json({ error: message }, { status: 502 });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("invoices") === "1") {
      return NextResponse.json({ invoices: listPaymentInvoices().map(serializeInvoice) });
    }

    const rates = await getFxRates();
    return NextResponse.json({
      rates: Object.fromEntries(
        CURRENCIES.map((currency) => [
          currency,
          {
            currencyPerBtc: rates.btcUsd * rates.fiatPerUsd[currency],
            btcUsd: rates.btcUsd,
          },
        ]),
      ),
      updatedAt: rates.updatedAt,
      source: "Coinbase Spot + open.er-api.com",
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    let body: { action?: PaymentAction; payload?: Record<string, unknown> };
    try {
      body = await request.json();
    } catch {
      throw new PaymentRequestError("Corps JSON invalide.");
    }
    const payload = body.payload ?? {};
    if (body.action === "quote") {
      const currency = parseCurrency(payload.currency);
      const direction = payload.direction;
      const amount = parsePositiveAmount(payload.amount, "Montant");
      const rates = await getFxRates();
      const currencyPerBtc = rates.btcUsd * rates.fiatPerUsd[currency];
      if (direction === "fiat_to_btc") {
        const amountSats = fiatToSats(amount, rates, currency);
        return NextResponse.json({
          currency,
          amountFiat: amount,
          amountBtc: amountSats / 100_000_000,
          impliedFiat: (amountSats / 100_000_000) * currencyPerBtc,
          currencyPerBtc,
          updatedAt: rates.updatedAt,
        });
      }
      if (direction === "btc_to_fiat") {
        return NextResponse.json({
          currency,
          amountBtc: amount,
          amountFiat: amount * currencyPerBtc,
          currencyPerBtc,
          updatedAt: rates.updatedAt,
        });
      }
      throw new PaymentRequestError("Sens de conversion invalide.");
    }

    await ensureDashboardWallets();
    await requireRegtest();

    switch (body.action) {
      case "create_invoice": {
        const currency = parseCurrency(payload.currency);
        const amountFiat = parsePositiveAmount(payload.amountFiat, "Montant local");
        const expiresInMinutes = payload.expiresInMinutes ?? 30;
        const requiredConfirmations = payload.requiredConfirmations ?? 1;
        if (
          typeof expiresInMinutes !== "number" ||
          !Number.isInteger(expiresInMinutes) ||
          expiresInMinutes < 1 ||
          expiresInMinutes > 1440
        ) {
          throw new PaymentRequestError("L’expiration doit être comprise entre 1 et 1440 minutes.");
        }
        if (
          typeof requiredConfirmations !== "number" ||
          !Number.isInteger(requiredConfirmations) ||
          requiredConfirmations < 1 ||
          requiredConfirmations > 12
        ) {
          throw new PaymentRequestError("Les confirmations requises doivent être comprises entre 1 et 12.");
        }
        const rates = await getFxRates();
        const amountSats = fiatToSats(amountFiat, rates, currency);
        const invoiceId = crypto.randomUUID();
        const label = `invoice-${invoiceId.slice(0, 8)}`;
        const address = await bitcoinRpc<string>("getnewaddress", [label, "bech32"], "Trader");
        const createdAt = new Date();
        const invoice = createPaymentInvoice({
          invoiceId,
          address,
          label,
          currency,
          amountFiat,
          amountSats,
          amountBtc: amountSats / 100_000_000,
          currencyPerBtc: rates.btcUsd * rates.fiatPerUsd[currency],
          rateUpdatedAt: rates.updatedAt,
          createdAt: createdAt.toISOString(),
          expiresAt: new Date(createdAt.getTime() + expiresInMinutes * 60_000).toISOString(),
          requiredConfirmations,
        });
        return NextResponse.json({ invoice: serializeInvoice(invoice) }, { status: 201 });
      }

      case "invoice_status": {
        if (typeof payload.invoiceId !== "string") {
          throw new PaymentRequestError("Identifiant de facture requis.");
        }
        recoverStaleTestPaymentReservation(payload.invoiceId);
        recoverStaleSettlementReservation(payload.invoiceId);
        const invoice = getPaymentInvoice(payload.invoiceId);
        if (!invoice) throw new PaymentRequestError("Facture introuvable.", 404);
        await requireTraderAddress(invoice.address);
        const updated = await reconcileInvoice(invoice);
        const settlementConfirmations = updated.settlementTxid
          ? (await bitcoinRpc<WalletTransaction>(
              "gettransaction",
              [updated.settlementTxid, true],
              "Miner",
            )).confirmations
          : 0;
        return NextResponse.json({
          invoice: serializeInvoice(updated),
          settlementConfirmations,
        });
      }

      case "send_test_payment": {
        if (typeof payload.invoiceId !== "string") throw new PaymentRequestError("Identifiant de facture requis.");
        recoverStaleTestPaymentReservation(payload.invoiceId);
        const storedInvoice = getPaymentInvoice(payload.invoiceId);
        const invoice = storedInvoice ? await reconcileInvoice(storedInvoice) : null;
        if (!invoice) throw new PaymentRequestError("Facture introuvable.", 404);
        if (Date.parse(invoice.expiresAt) <= Date.now()) {
          throw new PaymentRequestError("Cette facture a expiré.", 409);
        }
        if (!["open", "partial"].includes(invoice.status)) {
          throw new PaymentRequestError("Cette facture n’accepte plus de nouveau paiement test.", 409);
        }
        await requireTraderAddress(invoice.address);
        const amountBtc = payload.amountBtc === undefined
          ? invoice.amountSats / 100_000_000
          : parsePositiveAmount(payload.amountBtc, "Montant BTC");
        const amountSats = btcToSats(amountBtc);
        if (amountSats < 1) throw new PaymentRequestError("Le montant doit représenter au moins un satoshi.");
        const reserved = reserveInvoiceTestPayment(invoice.invoiceId);
        if (!reserved) {
          throw new PaymentRequestError("Un paiement test est déjà en cours pour cette facture.", 409);
        }
        let txid: string;
        try {
          txid = await bitcoinRpc<string>(
            "sendtoaddress",
            [invoice.address, amountSats / 100_000_000, "Regtest payment demo", "", false, true],
            "Miner",
          );
        } catch (error) {
          if (error instanceof BitcoinRpcError) {
            releaseInvoiceTestPayment(invoice.invoiceId, invoice.status);
          }
          throw error;
        }
        const updated = markInvoicePaymentBroadcast(invoice.invoiceId, txid);
        if (!updated) {
          throw new PaymentRequestError(
            "Paiement diffusé, mais la facture n’a pas pu être mise à jour. Actualise son état avant toute nouvelle action.",
            409,
          );
        }
        return NextResponse.json({ txid, amountBtc: amountSats / 100_000_000 });
      }

      case "settle_invoice": {
        if (typeof payload.invoiceId !== "string") throw new PaymentRequestError("Identifiant de facture requis.");
        recoverStaleSettlementReservation(payload.invoiceId);
        let invoice = getPaymentInvoice(payload.invoiceId);
        if (!invoice) throw new PaymentRequestError("Facture introuvable.", 404);
        await requireTraderAddress(invoice.address);
        invoice = await reconcileInvoice(invoice);
        if (!["confirmed", "overpaid", "settlement_failed"].includes(invoice.status)) {
          throw new PaymentRequestError(
            "La facture doit être intégralement confirmée avant règlement.",
            409,
          );
        }
        const reserved = reserveInvoiceSettlement(invoice.invoiceId);
        if (!reserved) {
          throw new PaymentRequestError("Le règlement est déjà en cours ou a déjà été diffusé.", 409);
        }

        try {
          const utxos = await bitcoinRpc<WalletUtxo[]>(
            "listunspent",
            [invoice.requiredConfirmations, 9999999, [invoice.address]],
            "Trader",
          );
          const availableSats = utxos.reduce((sum, utxo) => sum + btcToSats(utxo.amount), 0);
          if (availableSats < invoice.amountSats) {
            throw new PaymentRequestError("Les fonds confirmés de cette facture ne sont plus disponibles.", 409);
          }
          const payoutSats = Math.min(availableSats, invoice.confirmedSats);
          const payoutAddress = await bitcoinRpc<string>(
            "getnewaddress",
            ["Simulated settlement", "bech32"],
            "Miner",
          );
          const txid = await bitcoinRpc<string>(
            "sendtoaddress",
            [
              payoutAddress,
              payoutSats / 100_000_000,
              "Regtest simulated settlement",
              "",
              true,
              true,
            ],
            "Trader",
          );
          const updated = markSettlementBroadcast(invoice.invoiceId, txid);
          if (!updated) throw new Error("Transaction diffusée, mais enregistrement de règlement introuvable.");
          return NextResponse.json({
            invoice: serializeInvoice(updated),
            txid,
            payoutAddress,
            grossSats: payoutSats,
            feeDeductedFromPayout: true,
          });
        } catch (error) {
          if (error instanceof BitcoinRpcError || error instanceof PaymentRequestError) {
            markSettlementFailed(invoice.invoiceId, error.message);
          }
          throw error;
        }
      }

      default:
        throw new PaymentRequestError("Action de paiement inconnue.");
    }
  } catch (error) {
    return errorResponse(error);
  }
}
