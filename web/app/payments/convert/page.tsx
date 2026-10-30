"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import PageHeading from "@/components/PageHeading";
import PaymentNavigation from "@/components/PaymentNavigation";
import { paymentAction } from "@/lib/payment-client";

type Currency = "CDF" | "USD" | "EUR";
type Direction = "fiat_to_btc" | "btc_to_fiat";

interface ConversionQuote {
  currency: Currency;
  amountFiat?: number;
  amountBtc: number;
  impliedFiat?: number;
  currencyPerBtc: number;
  updatedAt: string;
}

export default function ConvertPaymentPage() {
  const [amount, setAmount] = useState("10000");
  const [currency, setCurrency] = useState<Currency>("CDF");
  const [direction, setDirection] = useState<Direction>("fiat_to_btc");
  const [quote, setQuote] = useState<ConversionQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const convert = async () => {
    setBusy(true);
    setErrorMessage(null);
    setQuote(null);
    try {
      const result = await paymentAction<ConversionQuote>("quote", {
        amount: Number(amount),
        currency,
        direction,
      });
      setQuote(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Conversion impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeading title="Conversion indicative" description="Taux spot BTC/USD et change USD vers CDF, USD ou EUR." />
      <PaymentNavigation />
      <div className="mb-5 rounded border border-amber-800/60 bg-amber-950/30 p-3 text-xs text-amber-200">
        Estimation seulement · taux de marché indicatif · aucune conversion ou vente réelle.
      </div>
      {errorMessage && <div role="alert" className="mb-4 rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">{errorMessage}</div>}

      <Card className="max-w-2xl border-slate-800 bg-slate-900">
        <CardHeader><CardTitle className="text-base">Calculateur</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-400">
              Montant
              <Input type="number" min="0.00000001" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 border-slate-700 bg-slate-950" />
            </label>
            <label className="text-xs text-slate-400">
              Devise
              <select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)} className="mt-1 block h-9 w-full rounded border border-slate-700 bg-slate-950 px-3 text-sm text-slate-100">
                <option value="CDF">CDF · franc congolais</option>
                <option value="USD">USD · dollar américain</option>
                <option value="EUR">EUR · euro</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant={direction === "fiat_to_btc" ? "default" : "outline"} onClick={() => setDirection("fiat_to_btc")}>Local → BTC</Button>
            <Button variant={direction === "btc_to_fiat" ? "default" : "outline"} onClick={() => setDirection("btc_to_fiat")}>BTC → local</Button>
          </div>
          <Button onClick={() => void convert()} disabled={busy || Number(amount) <= 0} className="bg-emerald-700 hover:bg-emerald-600">
            {busy ? "Calcul..." : "Obtenir une estimation"}
          </Button>
          {quote && (
            <div className="rounded border border-emerald-900 bg-slate-950 p-4">
              <div className="text-xs text-slate-500">Estimation</div>
              <div className="mt-1 text-2xl font-semibold text-emerald-300">{quote.amountBtc.toFixed(8)} BTC</div>
              <div className="mt-1 text-sm text-slate-300">
                ≈ {(direction === "fiat_to_btc" ? quote.impliedFiat : quote.amountFiat)?.toLocaleString(undefined, { maximumFractionDigits: 2 })} {quote.currency}
              </div>
              <div className="mt-3 text-xs text-slate-500">
                1 BTC ≈ {quote.currencyPerBtc.toLocaleString(undefined, { maximumFractionDigits: 2 })} {quote.currency} · {new Date(quote.updatedAt).toLocaleString()}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
