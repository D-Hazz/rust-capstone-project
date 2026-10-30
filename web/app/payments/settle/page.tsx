"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PageHeading from "@/components/PageHeading";
import PaymentNavigation from "@/components/PaymentNavigation";
import { paymentAction, usePaymentInvoices, type PaymentInvoice, type PaymentStatus } from "@/lib/payment-client";

interface InvoiceStatusResult {
  invoice: PaymentInvoice;
  settlementConfirmations: number;
}

export default function SettlePaymentPage() {
  const { invoices, loaded, loadError, updateInvoice } = usePaymentInvoices();
  const [busyInvoiceId, setBusyInvoiceId] = useState<string | null>(null);
  const [settlementConfirmations, setSettlementConfirmations] = useState<Record<string, number>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const checkInvoice = useCallback(async (invoice: PaymentInvoice) => {
    const result = await paymentAction<InvoiceStatusResult>("invoice_status", {
      invoiceId: invoice.invoiceId,
    });
    updateInvoice(result.invoice);
    setSettlementConfirmations((previous) => ({
      ...previous,
      [invoice.invoiceId]: result.settlementConfirmations,
    }));
    return result;
  }, [updateInvoice]);

  useEffect(() => {
    const pending = invoices.filter(
      (invoice) => invoice.status === "settlement_pending" && invoice.settlementTxid,
    );
    if (pending.length === 0) return;
    let active = true;
    const poll = async () => {
      await Promise.all(pending.map(async (invoice) => {
        try {
          const result = await paymentAction<InvoiceStatusResult>("invoice_status", {
            invoiceId: invoice.invoiceId,
          });
          if (active) {
            updateInvoice(result.invoice);
            setSettlementConfirmations((previous) => ({
              ...previous,
              [invoice.invoiceId]: result.settlementConfirmations,
            }));
          }
        } catch (error) {
          if (active) setErrorMessage(error instanceof Error ? error.message : "Vérification du règlement impossible");
        }
      }));
    };
    const timer = window.setTimeout(() => void poll(), 0);
    const interval = window.setInterval(() => void poll(), 5000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [invoices, updateInvoice]);

  const verify = async (invoice: PaymentInvoice) => {
    setBusyInvoiceId(invoice.invoiceId);
    setErrorMessage(null);
    try {
      const { invoice: current } = await checkInvoice(invoice);
      setNotice(statusNotice(current));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Vérification impossible");
    } finally {
      setBusyInvoiceId(null);
    }
  };

  const settleInvoice = async (invoice: PaymentInvoice) => {
    if (!window.confirm(
      `Diffuser le règlement regtest de ${invoice.confirmedBtc.toFixed(8)} BTC vers Miner ?`,
    )) return;
    setBusyInvoiceId(invoice.invoiceId);
    setErrorMessage(null);
    setNotice(null);
    try {
      const result = await paymentAction<{ invoice: PaymentInvoice; txid: string }>("settle_invoice", {
        invoiceId: invoice.invoiceId,
      });
      updateInvoice(result.invoice);
      setSettlementConfirmations((previous) => ({ ...previous, [invoice.invoiceId]: 0 }));
      setNotice(`Règlement diffusé · ${result.txid}. Le statut reste « diffusé » jusqu’à confirmation.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Règlement impossible");
      try {
        const { invoice: updated } = await checkInvoice(invoice);
        updateInvoice(updated);
      } catch (refreshError) {
        const detail = refreshError instanceof Error ? refreshError.message : "Actualisation impossible";
        setErrorMessage((previous) => `${previous || "Règlement à vérifier."} Actualisation : ${detail}`);
      }
    } finally {
      setBusyInvoiceId(null);
    }
  };

  return (
    <div>
      <PageHeading title="Règlement" description="Règle les factures confirmées vers Miner." />
      <PaymentNavigation />
      <div className="mb-5 rounded border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-200">
        Regtest seulement · aucun virement CDF, USD ou EUR.
      </div>
      {loadError && <div role="alert" className="mb-4 rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">{loadError}</div>}
      {errorMessage && <div role="alert" className="mb-4 rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">{errorMessage}</div>}
      {notice && <div role="status" className="mb-4 rounded border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-300">{notice}</div>}

      {!loaded || invoices.length === 0 ? (
        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="pt-5 text-sm text-slate-400">
            {!loaded ? "Chargement des factures..." : "Aucune facture serveur. Crée-en une dans « Recevoir »."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {invoices.map((invoice) => {
            const settled = invoice.status === "settlement_confirmed";
            const canSettle =
              (invoice.status === "confirmed" || invoice.status === "overpaid" || invoice.status === "settlement_failed") &&
              !invoice.settlementTxid;
            return (
              <Card key={invoice.invoiceId} className="border-slate-800 bg-slate-900">
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">
                      {invoice.amountFiat.toLocaleString()} {invoice.currency} · {invoice.amountBtc.toFixed(8)} BTC
                    </CardTitle>
                    <p className="mt-1 break-all text-xs text-slate-500">{invoice.address}</p>
                  </div>
                  <StatusBadge status={invoice.status} />
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-slate-400">
                    Reçu {invoice.receivedBtc.toFixed(8)} · confirmé {invoice.confirmedBtc.toFixed(8)} BTC · seuil {invoice.requiredConfirmations} conf.
                  </p>
                  {invoice.status === "partial" && <p className="text-xs text-amber-300">Montant partiel · manque {(invoice.shortfallSats / 100_000_000).toFixed(8)} BTC.</p>}
                  {invoice.status === "overpaid" && <p className="text-xs text-amber-300">Surpaiement · excédent {(invoice.excessSats / 100_000_000).toFixed(8)} BTC inclus dans le règlement.</p>}
                  {invoice.status === "expired" && <p className="text-xs text-red-300">Facture expirée · règlement bloqué.</p>}
                  {invoice.status === "settlement_pending" && (
                    <p className="text-xs text-amber-300">
                      Règlement diffusé · {settlementConfirmations[invoice.invoiceId] ?? 0} confirmation(s).
                    </p>
                  )}
                  {settled && <p className="text-xs text-emerald-300">Règlement confirmé sur regtest.</p>}
                  {invoice.status === "settlement_failed" && <p className="text-xs text-red-300">Échec : {invoice.settlementError || "règlement à retenter."}</p>}
                  {invoice.settlementTxid && <p className="break-all text-xs text-slate-400">Tx règlement · {invoice.settlementTxid}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" disabled={busyInvoiceId === invoice.invoiceId} onClick={() => void verify(invoice)}>
                      Vérifier
                    </Button>
                    <Button
                      disabled={busyInvoiceId === invoice.invoiceId || !canSettle}
                      onClick={() => void settleInvoice(invoice)}
                      className="bg-emerald-700 hover:bg-emerald-600"
                    >
                      {busyInvoiceId === invoice.invoiceId ? "Traitement..." : "Régler vers Miner"}
                    </Button>
                  </div>
                  {invoice.paymentTxid && <p className="break-all text-[10px] text-slate-500">Tx paiement · {invoice.paymentTxid}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function statusNotice(invoice: PaymentInvoice): string {
  if (invoice.status === "open") return "Aucun paiement détecté.";
  if (invoice.status === "partial") return `Paiement partiel · manque ${(invoice.shortfallSats / 100_000_000).toFixed(8)} BTC.`;
  if (invoice.status === "pending") return "Paiement repéré, en attente des confirmations requises.";
  if (invoice.status === "confirmed" || invoice.status === "overpaid") return "Paiement confirmé, règlement disponible.";
  if (invoice.status === "expired") return "Facture expirée.";
  if (invoice.status === "settlement_pending") return "Règlement diffusé, en attente de confirmation.";
  if (invoice.status === "settlement_confirmed") return "Règlement confirmé.";
  return `Règlement en échec : ${invoice.settlementError || "vérifie puis réessaie."}`;
}

function StatusBadge({ status }: { status: PaymentStatus }) {
  const labels: Record<PaymentStatus, string> = {
    open: "En attente",
    partial: "Partiel",
    pending: "Mempool",
    confirmed: "Confirmé",
    overpaid: "Surpayé",
    expired: "Expiré",
    settlement_pending: "Diffusé",
    settlement_confirmed: "Confirmé",
    settlement_failed: "Échec",
  };
  return <Badge variant="outline">{labels[status]}</Badge>;
}
