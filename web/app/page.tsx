"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import PageHeading from "@/components/PageHeading";

interface NodeState {
  blocks: number;
  chain: string;
  bestblockhash: string;
  mempoolSize: number;
  minerBalance: number;
  traderBalance: number;
}

const modules = [
  { href: "/mempool", title: "Mempool & RBF", detail: "Transactions, frais et remplacement" },
  { href: "/utxo", title: "UTXO & scripts", detail: "Wallets, sorties et formats d’adresses" },
  { href: "/consensus", title: "Consensus", detail: "Poids de bloc et réorganisation regtest" },
  { href: "/blocks", title: "Explorateur", detail: "Blocs, transactions et scripts" },
  { href: "/payments/receive", title: "Paiements", detail: "Réception, conversion et règlement simulé" },
];

export default function DashboardPage() {
  const [node, setNode] = useState<NodeState | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/bitcoin", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || `Erreur (${response.status})`);
      setNode(result);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nœud indisponible");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => {
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, [refresh]);

  const act = async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/bitcoin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload }),
      });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error || `Erreur (${response.status})`);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Action impossible");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeading
        title="Bitcoin Regtest Studio"
        description="Paiements programmables · démonstration locale"
        aside={node && <Badge variant="outline">{node.chain} · bloc {node.blocks}</Badge>}
      />
      {errorMessage && (
        <div role="alert" className="mb-5 rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          {errorMessage}
        </div>
      )}
      {!node ? (
        <p className="text-sm text-slate-400">Connexion à Bitcoin Core regtest…</p>
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Metric title="Miner" value={`${node.minerBalance.toFixed(8)} BTC`} />
            <Metric title="Trader" value={`${node.traderBalance.toFixed(8)} BTC`} />
            <Metric title="Mempool" value={`${node.mempoolSize} tx`} />
          </div>
          <Card className="mb-6 border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className="text-sm">Actions rapides</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-3">
              <Button
                onClick={() => void act("generate_blocks", { count: node.minerBalance > 0 ? 1 : 101 })}
                disabled={busy}
                className="bg-emerald-700 hover:bg-emerald-600"
              >
                {node.minerBalance > 0 ? "Miner 1 bloc" : "Initialiser Miner (101 blocs)"}
              </Button>
              <Button
                onClick={() => void act("send_miner_to_trader", { amount: 20 })}
                disabled={busy || node.minerBalance < 20}
                className="bg-blue-700 hover:bg-blue-600"
              >
                Envoyer 20 BTC à Trader
              </Button>
            </CardContent>
          </Card>
          <section aria-label="Modules">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Modules</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {modules.map((module) => (
                <Link key={module.href} href={module.href}>
                  <Card className="h-full border-slate-800 bg-slate-900 transition-colors hover:border-slate-600">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base text-amber-300">{module.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="text-sm text-slate-400">{module.detail}</CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
          <div className="mt-6 break-all rounded border border-slate-800 bg-slate-900 p-3 text-xs text-slate-500">
            Best block · {node.bestblockhash}
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <Card className="border-slate-800 bg-slate-900">
      <CardContent className="pt-5">
        <div className="text-xs text-slate-500">{title}</div>
        <div className="mt-1 text-xl font-semibold text-slate-100">{value}</div>
      </CardContent>
    </Card>
  );
}
