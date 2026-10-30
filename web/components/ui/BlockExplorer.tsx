"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface BlockHeader {
  hash: string;
  height: number;
  version: number;
  versionHex: string;
  merkleroot: string;
  time: number;
  mediantime: number;
  nonce: number;
  bits: string;
  difficulty: number;
  previousblockhash?: string;
  nTx: number;
  tx: any[];
}

export default function BlockExplorer({ currentBlockCount }: { currentBlockCount: number }) {
  const [blocks, setBlocks] = useState<BlockHeader[]>([]);
  const [selectedBlock, setSelectedBlock] = useState<BlockHeader | null>(null);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  // Charger les 8 derniers blocs minés
  const fetchRecentBlocks = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/bitcoin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_recent_blocks", payload: { count: 8 } }),
      });
      const json = await res.json();
      if (json.blocks) {
        setBlocks(json.blocks);
        if (!selectedBlock && json.blocks.length > 0) {
          fetchBlockDetails(json.blocks[0].hash);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecentBlocks();
  }, [currentBlockCount]);

  const fetchBlockDetails = async (hash: string) => {
    try {
      const res = await fetch("/api/bitcoin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "get_block_details", payload: { hash } }),
      });
      const json = await res.json();
      if (json.block) {
        setSelectedBlock(json.block);
        setSelectedTx(null); // Réinitialiser la TX sélectionnée
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Liste des blocs minés */}
      <Card className="bg-slate-900 border-slate-800 text-slate-100">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-amber-400">🧊 Blocs Récents</CardTitle>
            <CardDescription>Cliquez sur un bloc pour inspecter son en-tête et ses transactions</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchRecentBlocks} disabled={loading}>
            Rafraîchir
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
            {blocks.map((b) => (
              <button
                key={b.hash}
                onClick={() => fetchBlockDetails(b.hash)}
                className={`p-3 rounded border text-center transition-all ${
                  selectedBlock?.hash === b.hash
                    ? "border-amber-500 bg-amber-950/40 text-amber-300"
                    : "border-slate-800 bg-slate-950 hover:border-slate-700 text-slate-300"
                }`}
              >
                <div className="text-xs text-slate-500">Bloc</div>
                <div className="font-bold text-base">#{b.height}</div>
                <div className="text-[10px] text-slate-400 mt-1">{b.nTx} tx</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 2. Inspection de l'en-tête du bloc (Block Header) */}
      {selectedBlock && (
        <Card className="bg-slate-900 border-slate-800 text-slate-100">
          <CardHeader>
            <CardTitle className="text-purple-400 flex items-center justify-between">
              <span>En-tête du Bloc #{selectedBlock.height}</span>
              <Badge variant="outline" className="text-purple-300 border-purple-500/50">
                Hash: {selectedBlock.hash.substring(0, 12)}...
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono bg-slate-950 p-4 rounded border border-slate-800">
              <div>
                <span className="text-slate-500 block">Version:</span>
                <span className="text-slate-200">{selectedBlock.version} (0x{selectedBlock.versionHex})</span>
              </div>
              <div>
                <span className="text-slate-500 block">Bits (Cible de difficulté):</span>
                <span className="text-slate-200">{selectedBlock.bits}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Nonce:</span>
                <span className="text-amber-400">{selectedBlock.nonce}</span>
              </div>
              <div>
                <span className="text-slate-500 block">Horodatage (Timestamp):</span>
                <span className="text-slate-200">{new Date(selectedBlock.time * 1000).toLocaleString()}</span>
              </div>
              <div className="md:col-span-2">
                <span className="text-slate-500 block">Racine de Merkle (Merkle Root):</span>
                <span className="text-emerald-400 break-all">{selectedBlock.merkleroot}</span>
              </div>
              <div className="md:col-span-3">
                <span className="text-slate-500 block">Hash du Bloc Précédent:</span>
                <span className="text-slate-400 break-all">{selectedBlock.previousblockhash || "Bloc Genesis"}</span>
              </div>
            </div>

            {/* Liste des transactions du bloc */}
            <div>
              <h4 className="text-sm font-semibold text-slate-300 mb-2">
                Transactions incluses ({selectedBlock.tx.length})
              </h4>
              <div className="space-y-2">
                {selectedBlock.tx.map((tx: any, idx: number) => (
                  <div
                    key={tx.txid || idx}
                    onClick={() => setSelectedTx(tx)}
                    className={`p-3 rounded border text-xs cursor-pointer font-mono transition-all ${
                      selectedTx?.txid === tx.txid
                        ? "border-blue-500 bg-blue-950/30"
                        : "border-slate-800 bg-slate-950 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-blue-400 font-bold">
                        {idx === 0 ? "🪙 Transaction Coinbase (Récompense)" : `Tx #${idx}`}
                      </span>
                      <span className="text-slate-500">{tx.vsize || tx.size} vB</span>
                    </div>
                    <div className="text-slate-400 break-all">{tx.txid}</div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 3. Décodeur de Transaction Brute (Inputs & Outputs / UTXOs) */}
      {selectedTx && (
        <Card className="bg-slate-900 border-slate-800 text-slate-100">
          <CardHeader>
            <CardTitle className="text-blue-400">
              🔍 Décodeur de Transaction Brute (UTXOs)
            </CardTitle>
            <CardDescription className="font-mono text-xs text-slate-400 break-all">
              TxID: {selectedTx.txid}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
              {/* Entrées (Inputs / UTXOs consommés) */}
              <div className="bg-slate-950 p-4 rounded border border-slate-800 space-y-3">
                <h5 className="font-bold text-red-400 uppercase tracking-wider">
                  Inputs (UTXOs Consommés)
                </h5>
                {selectedTx.vin.map((input: any, i: number) => (
                  <div key={i} className="p-2 bg-slate-900 rounded border border-slate-800">
                    {input.coinbase ? (
                      <div className="text-emerald-400">
                        Nouveau Bitcoin extrait (Génération Coinbase)
                      </div>
                    ) : (
                      <>
                        <div className="text-slate-400">
                          <span className="text-slate-500">TxID Parent:</span>{" "}
                          {input.txid?.substring(0, 16)}...
                        </div>
                        <div className="text-slate-400">
                          <span className="text-slate-500">Vout Index:</span> {input.vout}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Sorties (Outputs / Nouveaux UTXOs créés) */}
              <div className="bg-slate-950 p-4 rounded border border-slate-800 space-y-3">
                <h5 className="font-bold text-emerald-400 uppercase tracking-wider">
                  Outputs (Nouveaux UTXOs / Destinataires)
                </h5>
                {selectedTx.vout.map((output: any, i: number) => (
                  <div key={i} className="p-2 bg-slate-900 rounded border border-slate-800 space-y-1">
                    <div className="flex justify-between font-bold text-slate-200">
                      <span>Sortie #{output.n}</span>
                      <span className="text-amber-400">{output.value} BTC</span>
                    </div>
                    <div className="text-slate-400 break-all">
                      <span className="text-slate-500">Adresse:</span>{" "}
                      {output.scriptPubKey?.address || "Script OP_RETURN / Inconnu"}
                    </div>
                    <div className="text-slate-500 text-[10px]">
                      Type: {output.scriptPubKey?.type}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}