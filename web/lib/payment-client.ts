"use client";

import { useCallback, useEffect, useState } from "react";

export type PaymentStatus =
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
  status: PaymentStatus;
  paymentTxid: string | null;
  settlementTxid: string | null;
  settlementError: string | null;
  receivedSats: number;
  confirmedSats: number;
  receivedBtc: number;
  confirmedBtc: number;
  shortfallSats: number;
  excessSats: number;
  updatedAt: string;
}

export async function paymentAction<T>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const response = await fetch("/api/payments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const result = await response.json();
  if (!response.ok || result.error) {
    throw new Error(result.error || `Erreur (${response.status})`);
  }
  return result as T;
}

export function usePaymentInvoices() {
  const [invoices, setInvoices] = useState<PaymentInvoice[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const refreshInvoices = useCallback(async () => {
    const response = await fetch("/api/payments?invoices=1", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok || result.error) {
      throw new Error(result.error || `Erreur (${response.status})`);
    }
    setInvoices(result.invoices as PaymentInvoice[]);
    setLoaded(true);
    setLoadError(null);
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        await refreshInvoices();
      } catch (error) {
        if (active) {
          setLoaded(true);
          setLoadError(error instanceof Error ? error.message : "Chargement des factures impossible");
        }
      }
    };
    const timer = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [refreshInvoices]);

  const addInvoice = useCallback((invoice: PaymentInvoice) => {
    setInvoices((previous) => [invoice, ...previous.filter((item) => item.invoiceId !== invoice.invoiceId)]);
  }, []);

  const updateInvoice = useCallback((invoice: PaymentInvoice) => {
    setInvoices((previous) => [
      invoice,
      ...previous.filter((item) => item.invoiceId !== invoice.invoiceId),
    ]);
  }, []);

  return { invoices, loaded, loadError, addInvoice, updateInvoice, refreshInvoices };
}
