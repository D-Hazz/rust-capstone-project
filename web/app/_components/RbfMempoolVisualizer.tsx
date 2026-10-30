"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface MempoolTransaction {
  txid: string;
  vsize: number;
  feeRate: number;
  replaceable: boolean;
}

interface MempoolEntry {
  vsize: number;
  fees: { base: number };
}

async function postAction<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("/api/bitcoin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const result = await response.json();
  if (!response.ok || result.error) {
    throw new Error(result.error || `Erreur serveur (${response.status})`);
  }
  return result as T;
}

export default function RbfMempoolVisualizer({
  mempoolTxids,
  minerBalance,
}: {
  mempoolTxids: MempoolTransaction[];
  minerBalance: number;
}) {
  const [targetAddress, setTargetAddress] = useState("");
  const [feeRate, setFeeRate] = useState(2);
  const [activeTxid, setActiveTxid] = useState<string | null>(null);
  const [bumpFeeRate, setBumpFeeRate] = useState(10);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (message: string) =>
    setLogs((previous) => [`[${new Date().toLocaleTimeString()}] ${message}`, ...previous]);

  const handleSendRbf = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const { txid } = await postAction<{ txid: string }>("send_rbf_transaction", {
        amount: 1.5,
        feeRate,
        targetAddress: targetAddress.trim(),
      });
      setActiveTxid(txid);
      addLog(`Transaction RBF diffusée : ${txid} à ${feeRate} sat/vB`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible d'envoyer la transaction RBF");
    } finally {
      setLoading(false);
    }
  };

  const handleBumpFee = async () => {
    if (!activeTxid) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const { newTxid, origFee, newFee } = await postAction<{
        newTxid: string;
        origFee: number;
        newFee: number;
      }>("bump_fee", { txid: activeTxid, newFeeRate: bumpFeeRate });
      addLog(`Remplacement : ${activeTxid} → ${newTxid} · frais ${origFee} → ${newFee} BTC`);
      setActiveTxid(newTxid);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible d'augmenter les frais");
    } finally {
      setLoading(false);
    }
  };

  const refreshActiveEntry = async (txid: string) => {
    setActiveTxid(txid);
    setErrorMessage(null);
    try {
      await postAction<{ entry: MempoolEntry }>("get_mempool_entry", { txid });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Transaction introuvable dans le mempool");
    }
  };

  const feeBuckets = [
    { label: "0–5 sat/vB", matches: (rate: number) => rate <= 5 },
    { label: "5–10 sat/vB", matches: (rate: number) => rate > 5 && rate <= 10 },
    { label: "10–20 sat/vB", matches: (rate: number) => rate > 10 && rate <= 20 },
    { label: "> 20 sat/vB", matches: (rate: number) => rate > 20 },
  ];

  return (
    <div className="space-y-6">
      {errorMessage && (
        <div role="alert" className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          {errorMessage}
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="border-slate-800 bg-slate-900 font-mono text-slate-100">
          <CardHeader>
            <CardTitle className="text-amber-400">Émettre une transaction RBF</CardTitle>
            <CardDescription>Diffuser 1,5 BTC avec signalement de remplacement BIP 125.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block text-xs text-slate-400">
              Adresse regtest destinataire
              <Input
                placeholder="bcrt1q..."
                value={targetAddress}
                onChange={(event) => setTargetAddress(event.target.value)}
                className="mt-1 border-slate-800 bg-slate-950 text-slate-200"
              />
            </label>
            <label className="block text-xs text-slate-400">
              Taux de frais initial (sat/vB)
              <Input
                type="number"
                min="1"
                step="1"
                value={feeRate}
                onChange={(event) => setFeeRate(Number(event.target.value))}
                className="mt-1 border-slate-800 bg-slate-950 text-slate-200"
              />
            </label>
            <Button
              onClick={handleSendRbf}
              disabled={loading || minerBalance < 1.5 || !targetAddress.trim() || feeRate <= 0}
              className="w-full bg-amber-600 text-white hover:bg-amber-500"
            >
              {loading ? "Envoi en cours..." : "Émettre la transaction RBF"}
            </Button>
            {minerBalance < 1.5 && (
              <p className="text-xs text-amber-300">Le portefeuille Miner doit avoir au moins 1,5 BTC disponibles.</p>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900 font-mono text-slate-100">
          <CardHeader>
            <CardTitle className="text-blue-400">Remplacer la transaction (bump fee)</CardTitle>
            <CardDescription>Choisis une transaction remplaçable du mempool ou utilise celle que tu viens d&apos;émettre.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="block text-xs text-slate-400">
              TxID sélectionné
              <select
                value={activeTxid ?? ""}
                onChange={(event) => {
                  if (event.target.value) void refreshActiveEntry(event.target.value);
                  else setActiveTxid(null);
                }}
                className="mt-1 h-9 w-full rounded border border-slate-800 bg-slate-950 px-2 text-slate-200"
              >
                <option value="">Sélectionner une transaction...</option>
                {mempoolTxids.map((transaction) => (
                  <option key={transaction.txid} value={transaction.txid}>
                    {transaction.txid.slice(0, 16)}... · {transaction.feeRate.toFixed(2)} sat/vB
                  </option>
                ))}
              </select>
            </label>
            {activeTxid && <p className="break-all text-xs text-slate-400">{activeTxid}</p>}
            <label className="block text-xs text-slate-400">
              Nouveau taux cible (sat/vB)
              <Input
                type="number"
                min="1"
                step="1"
                value={bumpFeeRate}
                onChange={(event) => setBumpFeeRate(Number(event.target.value))}
                className="mt-1 border-slate-800 bg-slate-950 text-slate-200"
              />
            </label>
            <Button
              onClick={handleBumpFee}
              disabled={loading || !activeTxid || bumpFeeRate <= 0 || !mempoolTxids.some((tx) => tx.txid === activeTxid && tx.replaceable)}
              className="w-full bg-blue-600 text-white hover:bg-blue-500"
            >
              Augmenter les frais
            </Button>
            {activeTxid && !mempoolTxids.some((tx) => tx.txid === activeTxid && tx.replaceable) && (
              <p className="text-xs text-amber-300">Cette transaction n&apos;est pas signalée comme remplaçable dans le mempool.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-800 bg-slate-900 font-mono text-slate-100">
        <CardHeader>
          <CardTitle className="text-emerald-400">Mempool réel · {mempoolTxids.length} transaction(s)</CardTitle>
          <CardDescription>Répartition calculée à partir des frais et de la taille communiqués par Bitcoin Core.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 text-center md:grid-cols-4">
            {feeBuckets.map((bucket) => (
              <div key={bucket.label} className="rounded border border-slate-800 bg-slate-950 p-3">
                <span className="block text-xs text-slate-500">{bucket.label}</span>
                <span className="text-lg font-bold text-slate-200">
                  {mempoolTxids.filter((tx) => bucket.matches(tx.feeRate)).length} tx
                </span>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {mempoolTxids.length === 0 ? (
              <p className="text-sm text-slate-400">Le mempool est vide.</p>
            ) : (
              mempoolTxids.map((transaction) => (
                <button
                  key={transaction.txid}
                  onClick={() => void refreshActiveEntry(transaction.txid)}
                  className="flex w-full flex-col gap-1 rounded border border-slate-800 bg-slate-950 p-3 text-left text-xs hover:border-slate-600 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="break-all text-slate-300">{transaction.txid}</span>
                  <span className="flex shrink-0 items-center gap-2 text-slate-400">
                    {transaction.vsize} vB · {transaction.feeRate.toFixed(2)} sat/vB
                    <Badge variant="outline">{transaction.replaceable ? "RBF" : "Non-RBF"}</Badge>
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded border border-slate-800 bg-slate-950 p-3 text-xs">
            <div className="mb-2 font-bold text-slate-400">Journal RBF</div>
            {logs.length === 0 ? (
              <p className="text-slate-500">Aucune action RBF pour cette session.</p>
            ) : (
              logs.map((log, index) => <div key={`${index}-${log}`} className="text-amber-300/90">{log}</div>)
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
