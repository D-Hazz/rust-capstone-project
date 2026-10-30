"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import PageHeading from "@/components/PageHeading";
import PaymentNavigation from "@/components/PaymentNavigation";
import { paymentAction, usePaymentInvoices, type PaymentInvoice, type PaymentStatus } from "@/lib/payment-client";

const currencies = ["CDF", "USD", "EUR"] as const;

export default function ReceivePaymentPage() {
  const { invoices, loaded, loadError, addInvoice, updateInvoice } = usePaymentInvoices();
  const [amount, setAmount] = useState("10000");
  const [currency, setCurrency] = useState<(typeof currencies)[number]>("CDF");
  const [expiresInMinutes, setExpiresInMinutes] = useState(30);
  const [requiredConfirmations, setRequiredConfirmations] = useState(1);
  const [testAmount, setTestAmount] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const selected = invoices.find(({ invoiceId }) => invoiceId === selectedId) ?? invoices[0] ?? null;
  const selectedInvoiceId = selected?.invoiceId;
  const selectedAddress = selected?.address;
  const selectedAmountBtc = selected?.amountBtc;
  const selectedStatus = selected?.status;
  const paymentUri = selected
    ? `bitcoin:${selected.address}?${new URLSearchParams({
        amount: selected.amountBtc.toFixed(8),
        label: selected.label,
      }).toString()}`
    : null;

  useEffect(() => {
    if (!selectedInvoiceId || !selectedAddress || !selectedAmountBtc || selectedStatus === "settlement_confirmed") return;
    let active = true;
    const refresh = async () => {
      try {
        const result = await paymentAction<{ invoice: PaymentInvoice }>("invoice_status", {
          invoiceId: selectedInvoiceId,
        });
        if (active) updateInvoice(result.invoice);
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : "Vérification du paiement impossible");
      }
    };
    const timer = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [selectedInvoiceId, selectedAddress, selectedAmountBtc, selectedStatus, updateInvoice]);

  const createInvoice = async () => {
    setBusy(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const { invoice } = await paymentAction<{ invoice: PaymentInvoice }>("create_invoice", {
        amountFiat: Number(amount),
        currency,
        expiresInMinutes,
        requiredConfirmations,
      });
      addInvoice(invoice);
      setSelectedId(invoice.invoiceId);
      setTestAmount(invoice.amountBtc.toFixed(8));
      setNotice("Facture enregistrée sur le serveur.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Création de facture impossible");
    } finally {
      setBusy(false);
    }
  };

  const sendDemoPayment = async (invoice: PaymentInvoice) => {
    setBusy(true);
    setErrorMessage(null);
    setNotice(null);
    try {
      const result = await paymentAction<{ txid: string }>("send_test_payment", {
        invoiceId: invoice.invoiceId,
        amountBtc: Number(testAmount || invoice.amountBtc),
      });
      const { invoice: updated } = await paymentAction<{ invoice: PaymentInvoice }>("invoice_status", {
        invoiceId: invoice.invoiceId,
      });
      updateInvoice({ ...updated, paymentTxid: updated.paymentTxid || result.txid });
      setNotice(`Paiement regtest diffusé : ${result.txid}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Envoi du paiement impossible");
    } finally {
      setBusy(false);
    }
  };

  const mineConfirmations = async (invoice: PaymentInvoice) => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/bitcoin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_blocks",
          payload: { count: invoice.requiredConfirmations },
        }),
      });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || "Minage impossible");
      const { invoice: updated } = await paymentAction<{ invoice: PaymentInvoice }>("invoice_status", {
        invoiceId: invoice.invoiceId,
      });
      updateInvoice(updated);
      setNotice(`${invoice.requiredConfirmations} bloc(s) miné(s).`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Minage des confirmations impossible");
    } finally {
      setBusy(false);
    }
  };

  const copyAddress = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address);
      setNotice("Adresse copiée.");
    } catch {
      setErrorMessage("Copie impossible dans ce navigateur.");
    }
  };

  return (
    <div>
      <PageHeading title="Recevoir" description="Facture persistante · adresse regtest unique." />
      <PaymentNavigation />
      <DemoNotice />
      {loadError && <Message kind="error">{loadError}</Message>}
      {errorMessage && <Message kind="error">{errorMessage}</Message>}
      {notice && <Message kind="success">{notice}</Message>}

      <Card className="mb-6 border-slate-800 bg-slate-900">
        <CardHeader><CardTitle className="text-base">Nouvelle facture</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-xs text-slate-400">
            Montant local
            <Input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 border-slate-700 bg-slate-950" />
          </label>
          <SelectField label="Devise" value={currency} onChange={(value) => setCurrency(value as typeof currency)}>
            {currencies.map((code) => <option key={code} value={code}>{code}</option>)}
          </SelectField>
          <SelectField label="Expiration" value={expiresInMinutes} onChange={(value) => setExpiresInMinutes(Number(value))}>
            {[5, 15, 30, 60].map((minutes) => <option key={minutes} value={minutes}>{minutes} min</option>)}
          </SelectField>
          <SelectField label="Confirmations" value={requiredConfirmations} onChange={(value) => setRequiredConfirmations(Number(value))}>
            {[1, 2, 3, 6, 12].map((count) => <option key={count} value={count}>{count}</option>)}
          </SelectField>
          <Button onClick={() => void createInvoice()} disabled={busy || !loaded || Number(amount) <= 0} className="self-end bg-emerald-700 hover:bg-emerald-600">
            {busy ? "Création..." : "Créer facture"}
          </Button>
        </CardContent>
      </Card>

      {selected && (
        <Card className="mb-6 border-emerald-900 bg-slate-900">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base text-emerald-300">{selected.amountFiat.toLocaleString()} {selected.currency} · {selected.amountBtc.toFixed(8)} BTC</CardTitle>
              <p className="mt-1 break-all text-xs text-slate-500">{selected.invoiceId}</p>
            </div>
            <StatusBadge status={selected.status} />
          </CardHeader>
          <CardContent className="grid gap-5 md:grid-cols-[auto_1fr]">
            <div className="flex flex-col items-center gap-2 rounded border border-slate-700 bg-white p-3">
              {paymentUri && (
                <QRCodeSVG
                  value={paymentUri}
                  size={220}
                  level="M"
                  title={`Paiement de ${selected.amountBtc.toFixed(8)} BTC`}
                  aria-label={`QR code de paiement Bitcoin pour ${selected.amountBtc.toFixed(8)} BTC`}
                />
              )}
              <span className="text-xs font-medium text-slate-900">Scanner pour payer</span>
            </div>
            <div className="space-y-3">
              <div>
                <p className="mb-1 text-xs text-slate-500">Adresse regtest</p>
                <div className="break-all rounded border border-slate-800 bg-slate-950 p-3 font-mono text-sm text-amber-300">{selected.address}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => void copyAddress(selected.address)}>Copier l’adresse</Button>
                {paymentUri && (
                  <Button variant="outline" onClick={() => void navigator.clipboard.writeText(paymentUri).then(() => setNotice("Lien de paiement copié.")).catch(() => setErrorMessage("Copie impossible dans ce navigateur."))}>
                    Copier le lien de paiement
                  </Button>
                )}
              </div>
              <Button
                onClick={() => void sendDemoPayment(selected)}
                disabled={busy || !["open", "partial"].includes(selected.status)}
                className="bg-blue-700 hover:bg-blue-600"
              >
                Envoyer paiement test
              </Button>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-400">
                  Montant du paiement test (BTC)
                  <Input
                    type="number"
                    min="0.00000001"
                    step="0.00000001"
                    value={testAmount || selected.amountBtc.toFixed(8)}
                    onChange={(event) => setTestAmount(event.target.value)}
                    className="mt-1 border-slate-700 bg-slate-950"
                  />
                </label>
                <div className="text-xs text-slate-400">
                  Reçu {selected.receivedBtc.toFixed(8)} · confirmé {selected.confirmedBtc.toFixed(8)} BTC
                  <div className="mt-1 text-slate-500">Requis : {selected.requiredConfirmations} confirmation(s)</div>
                </div>
              </div>
              <StatusMessage invoice={selected} />
              {selected.paymentTxid && <p className="break-all text-xs text-slate-500">Paiement · {selected.paymentTxid}</p>}
              {selected.status === "pending" && (
                <Button variant="outline" onClick={() => void mineConfirmations(selected)} disabled={busy}>
                  Miner {selected.requiredConfirmations} confirmation(s)
                </Button>
              )}
              {selected.settlementTxid && <p className="break-all text-xs text-slate-400">Règlement · {selected.settlementTxid}</p>}
              <p className="text-xs text-slate-500">Expire le {new Date(selected.expiresAt).toLocaleString()}.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {invoices.length > 1 && (
        <div className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Factures serveur</h2>
          {invoices.filter((invoice) => invoice.invoiceId !== selected?.invoiceId).map((invoice) => (
            <button key={invoice.invoiceId} onClick={() => { setSelectedId(invoice.invoiceId); setTestAmount(invoice.amountBtc.toFixed(8)); }} className="flex w-full items-center justify-between gap-3 rounded border border-slate-800 bg-slate-900 p-3 text-left text-sm hover:border-slate-600">
              <span>{invoice.amountFiat.toLocaleString()} {invoice.currency} · {invoice.amountBtc.toFixed(8)} BTC</span>
              <StatusBadge status={invoice.status} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="text-xs text-slate-400">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 block h-9 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100">
        {children}
      </select>
    </label>
  );
}

function DemoNotice() {
  return <div className="mb-5 rounded border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-200">Regtest uniquement · paiement test financé par Miner.</div>;
}

function Message({ kind, children }: { kind: "error" | "success"; children: React.ReactNode }) {
  return <div role={kind === "error" ? "alert" : "status"} className={`mb-4 rounded border p-3 text-sm ${kind === "error" ? "border-red-800 bg-red-950/40 text-red-300" : "border-emerald-800 bg-emerald-950/30 text-emerald-300"}`}>{children}</div>;
}

function StatusBadge({ status }: { status: PaymentStatus }) {
  const labels: Record<PaymentStatus, string> = {
    open: "En attente",
    partial: "Partiel",
    pending: "Mempool",
    confirmed: "Confirmé",
    overpaid: "Surpayé",
    expired: "Expiré",
    settlement_pending: "Règlement diffusé",
    settlement_confirmed: "Réglé",
    settlement_failed: "Échec règlement",
  };
  return <Badge variant="outline">{labels[status]}</Badge>;
}

function StatusMessage({ invoice }: { invoice: PaymentInvoice }) {
  const messages: Partial<Record<PaymentStatus, string>> = {
    partial: `Paiement partiel · manque ${(invoice.shortfallSats / 100_000_000).toFixed(8)} BTC.`,
    overpaid: `Surpaiement · excédent ${(invoice.excessSats / 100_000_000).toFixed(8)} BTC.`,
    expired: "Facture expirée · les paiements reçus restent suivis.",
    pending: "Paiement reçu, confirmations en cours.",
    confirmed: "Montant confirmé, prêt pour règlement.",
    settlement_pending: "Règlement diffusé, en attente de confirmation.",
    settlement_confirmed: "Règlement confirmé sur regtest.",
    settlement_failed: `Échec règlement · ${invoice.settlementError || "consulte le module Régler."}`,
  };
  const message = messages[invoice.status];
  return message ? <p className="text-xs text-amber-300">{message}</p> : null;
}
