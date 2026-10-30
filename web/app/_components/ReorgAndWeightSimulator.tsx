"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface ReorgResult {
  invalidatedHash: string;
  invalidatedHeight: number;
  newBlocks: string[];
  newBestHash: string;
  mempoolTxids: string[];
}

interface BlockWeight {
  hash: string;
  height: number;
  size: number;
  weight: number;
  maxWeight: number;
  percentage: string;
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

export default function ReorgAndWeightSimulator({
  bestBlockHash,
  onChainChanged,
}: {
  bestBlockHash: string;
  onChainChanged: () => Promise<void>;
}) {
  const [reorgResult, setReorgResult] = useState<ReorgResult | null>(null);
  const [weightInfo, setWeightInfo] = useState<BlockWeight | null>(null);
  const [reorgLoading, setReorgLoading] = useState(false);
  const [weightLoading, setWeightLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const triggerReorg = async () => {
    if (!window.confirm("Cette simulation invalide temporairement le bloc tip et mine deux blocs de remplacement sur ta chaîne regtest. Continuer ?")) {
      return;
    }
    setReorgLoading(true);
    setErrorMessage(null);
    try {
      const result = await postAction<ReorgResult>("simulate_reorg");
      setReorgResult(result);
      setWeightInfo(null);
      await onChainChanged();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "La simulation de réorganisation a échoué");
    } finally {
      setReorgLoading(false);
    }
  };

  const checkBlockWeight = async () => {
    if (!bestBlockHash) return;
    setWeightLoading(true);
    setErrorMessage(null);
    try {
      const result = await postAction<BlockWeight>("get_block_weight", { hash: bestBlockHash });
      setWeightInfo(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible de mesurer le poids du bloc");
    } finally {
      setWeightLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-mono text-slate-100">
      {errorMessage && (
        <div role="alert" className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          {errorMessage}
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-red-400">Simulation de réorganisation</CardTitle>
            <CardDescription>
              Invalide le bloc tip regtest puis mine deux blocs. Cette action modifie la chaîne locale.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => void triggerReorg()}
              disabled={reorgLoading}
              className="w-full bg-red-600 text-white hover:bg-red-500"
            >
              {reorgLoading ? "Réorganisation en cours..." : "Simuler une réorganisation"}
            </Button>
            {reorgResult && (
              <div className="space-y-2 rounded border border-red-800/50 bg-red-950/30 p-3 text-xs text-red-200">
                <p className="font-bold">Réorganisation effectuée</p>
                <p>Bloc invalidé #{reorgResult.invalidatedHeight} : {reorgResult.invalidatedHash}</p>
                <p>Blocs de remplacement : {reorgResult.newBlocks.length}</p>
                <p>Nouveau tip : {reorgResult.newBestHash}</p>
                <p>Transactions actuellement dans le mempool : {reorgResult.mempoolTxids.length}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-amber-400">Poids du bloc</CardTitle>
            <CardDescription>
              Mesure le poids de consensus du tip actuel par rapport à la limite de 4 000 000 WU.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => void checkBlockWeight()}
              disabled={weightLoading || !bestBlockHash}
              className="w-full bg-amber-600 text-white hover:bg-amber-500"
            >
              {weightLoading ? "Mesure..." : "Mesurer le dernier bloc"}
            </Button>
            {weightInfo && (
              <div className="space-y-2">
                <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-400">
                  <span>Bloc #{weightInfo.height} · {weightInfo.size.toLocaleString()} octets</span>
                  <span>{weightInfo.weight.toLocaleString()} / {weightInfo.maxWeight.toLocaleString()} WU</span>
                </div>
                <Progress value={Number(weightInfo.percentage)} className="h-2 bg-slate-800" />
                <p className="text-right text-xs text-amber-300">{weightInfo.percentage}% de la limite</p>
                <p className="break-all text-[10px] text-slate-500">Hash : {weightInfo.hash}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
