"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface BlockSummary {
  hash: string;
  height: number;
  time: number;
  nTx: number;
  size: number;
  weight: number;
}

interface TransactionInput {
  txid?: string;
  vout?: number;
  coinbase?: string;
}

interface TransactionOutput {
  value: number;
  n: number;
  scriptPubKey: {
    address?: string;
    addresses?: string[];
    type: string;
    hex: string;
  };
}

interface BlockTransaction {
  txid: string;
  hash: string;
  size: number;
  vsize: number;
  weight: number;
  vin: TransactionInput[];
  vout: TransactionOutput[];
}

interface BlockDetails extends BlockSummary {
  version: number;
  versionHex: string;
  merkleroot: string;
  mediantime: number;
  nonce: number;
  bits: string;
  difficulty: number;
  previousblockhash?: string;
  tx: BlockTransaction[];
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

export default function BlockExplorer({
  currentBlockCount,
  bestBlockHash,
}: {
  currentBlockCount: number;
  bestBlockHash: string;
}) {
  const [blocks, setBlocks] = useState<BlockSummary[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<BlockDetails | null>(null);
  const [selectedTx, setSelectedTx] = useState<BlockTransaction | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchBlockDetails = useCallback(async (hash: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const { block } = await postAction<{ block: BlockDetails }>("get_block_details", { hash });
      setSelectedBlock(block);
      setSelectedTx(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible de charger ce bloc");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRecentBlocks = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const { blocks: recentBlocks } = await postAction<{ blocks: BlockSummary[] }>(
        "get_recent_blocks",
        { count: 8 },
      );
      setBlocks(recentBlocks);
      const newestHash = recentBlocks[0]?.hash;
      if (newestHash) {
        await fetchBlockDetails(newestHash);
      } else {
        setLoading(false);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible de charger les blocs récents");
      setLoading(false);
    }
  }, [fetchBlockDetails]);

  useEffect(() => {
    const refresh = window.setTimeout(() => void fetchRecentBlocks(), 0);
    return () => window.clearTimeout(refresh);
  }, [currentBlockCount, bestBlockHash, fetchRecentBlocks]);

  return (
    <div className="space-y-6 font-mono text-slate-100">
      {errorMessage && (
        <div role="alert" className="rounded border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          {errorMessage}
        </div>
      )}
      <Card className="border-slate-800 bg-slate-900">
        <CardHeader className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <CardTitle className="text-amber-400">Blocs récents</CardTitle>
            <CardDescription>Sélectionne un bloc pour afficher son en-tête et ses transactions confirmées.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchRecentBlocks()} disabled={loading}>
            {loading ? "Chargement..." : "Rafraîchir"}
          </Button>
        </CardHeader>
        <CardContent>
          {blocks.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun bloc disponible.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-8">
              {blocks.map((block) => (
                <button
                  key={block.hash}
                  onClick={() => void fetchBlockDetails(block.hash)}
                  className={`rounded border p-3 text-center transition-colors ${
                    selectedBlock?.hash === block.hash
                      ? "border-amber-500 bg-amber-950/40 text-amber-300"
                      : "border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-600"
                  }`}
                >
                  <span className="block text-xs text-slate-500">Bloc</span>
                  <span className="text-base font-bold">#{block.height}</span>
                  <span className="block text-[10px] text-slate-400">{block.nTx} tx</span>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {selectedBlock && (
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-purple-400">
              <span>Bloc #{selectedBlock.height}</span>
              <Badge variant="outline" className="break-all border-purple-500/50 font-mono text-purple-300">
                {selectedBlock.hash}
              </Badge>
            </CardTitle>
            <CardDescription>
              {selectedBlock.nTx} transaction(s) · {selectedBlock.size.toLocaleString()} octets · {selectedBlock.weight.toLocaleString()} WU
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-3 rounded border border-slate-800 bg-slate-950 p-4 text-xs md:grid-cols-3">
              <Detail label="Version" value={`${selectedBlock.version} (0x${selectedBlock.versionHex})`} />
              <Detail label="Bits" value={selectedBlock.bits} />
              <Detail label="Nonce" value={selectedBlock.nonce.toLocaleString()} />
              <Detail label="Date" value={new Date(selectedBlock.time * 1000).toLocaleString()} />
              <Detail label="Difficulté" value={selectedBlock.difficulty.toString()} />
              <Detail label="Racine de Merkle" value={selectedBlock.merkleroot} />
              <div className="md:col-span-3">
                <Detail label="Bloc précédent" value={selectedBlock.previousblockhash || "Bloc genesis"} />
              </div>
            </div>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-slate-300">
                Transactions incluses ({selectedBlock.tx.length})
              </h3>
              <div className="space-y-2">
                {selectedBlock.tx.map((transaction, index) => (
                  <button
                    key={transaction.txid}
                    onClick={() => setSelectedTx(transaction)}
                    className={`w-full rounded border p-3 text-left text-xs transition-colors ${
                      selectedTx?.txid === transaction.txid
                        ? "border-blue-500 bg-blue-950/30"
                        : "border-slate-800 bg-slate-950 hover:border-slate-600"
                    }`}
                  >
                    <span className="flex flex-wrap justify-between gap-2">
                      <span className="font-bold text-blue-300">
                        {index === 0 ? "Coinbase · récompense de bloc" : `Transaction #${index}`}
                      </span>
                      <span className="text-slate-500">{transaction.vsize} vB · {transaction.weight} WU</span>
                    </span>
                    <span className="mt-1 block break-all text-slate-400">{transaction.txid}</span>
                  </button>
                ))}
              </div>
            </section>
          </CardContent>
        </Card>
      )}

      {selectedTx && (
        <Card className="border-slate-800 bg-slate-900">
          <CardHeader>
            <CardTitle className="text-blue-400">Détails de transaction</CardTitle>
            <CardDescription className="break-all font-mono text-xs text-slate-400">
              TxID : {selectedTx.txid}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-5 font-mono text-xs md:grid-cols-2">
            <section className="space-y-3 rounded border border-slate-800 bg-slate-950 p-4">
              <h3 className="font-bold uppercase tracking-wider text-red-400">Inputs consommés</h3>
              {selectedTx.vin.map((input, index) => (
                <div key={`${input.txid ?? "coinbase"}:${input.vout ?? index}`} className="break-all rounded border border-slate-800 bg-slate-900 p-2 text-slate-400">
                  {input.coinbase ? (
                    <span className="text-emerald-400">Coinbase · création de nouveaux bitcoins</span>
                  ) : (
                    <>
                      <div>TxID parent : {input.txid}</div>
                      <div>Index vout : {input.vout}</div>
                    </>
                  )}
                </div>
              ))}
            </section>
            <section className="space-y-3 rounded border border-slate-800 bg-slate-950 p-4">
              <h3 className="font-bold uppercase tracking-wider text-emerald-400">Outputs créés</h3>
              {selectedTx.vout.map((output) => (
                <div key={output.n} className="space-y-1 rounded border border-slate-800 bg-slate-900 p-2">
                  <div className="flex justify-between gap-2 font-bold text-slate-200">
                    <span>Sortie #{output.n}</span>
                    <span className="text-amber-400">{output.value.toFixed(8)} BTC</span>
                  </div>
                  <div className="break-all text-slate-400">
                    Adresse : {output.scriptPubKey.address ?? output.scriptPubKey.addresses?.join(", ") ?? "script sans adresse"}
                  </div>
                  <div className="text-slate-500">Type : {output.scriptPubKey.type}</div>
                  <div className="break-all text-[10px] text-slate-600">Script : {output.scriptPubKey.hex}</div>
                </div>
              ))}
            </section>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-slate-500">{label}</span>
      <span className="break-all text-slate-200">{value}</span>
    </div>
  );
}
