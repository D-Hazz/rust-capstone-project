"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type AddressType = "legacy" | "p2sh-segwit" | "bech32" | "bech32m";

interface UtxoSetInfo {
  height: number;
  txouts: number;
  total_amount: number;
  disk_size: number;
}

interface WalletUtxo {
  txid: string;
  vout: number;
  address?: string;
  label?: string;
  scriptPubKey: string;
  amount: number;
  confirmations: number;
  spendable: boolean;
  safe: boolean;
}

interface GeneratedAddress {
  type: AddressType;
  address: string;
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

const addressTypes: Array<{
  type: AddressType;
  label: string;
  format: string;
  vbytes: string;
}> = [
  { type: "legacy", label: "P2PKH · Legacy", format: "m/n…", vbytes: "~148 vB / input" },
  { type: "p2sh-segwit", label: "P2SH-P2WPKH · Nested SegWit", format: "2…", vbytes: "~91 vB / input" },
  { type: "bech32", label: "P2WPKH · Native SegWit", format: "bcrt1q…", vbytes: "~68 vB / input" },
  { type: "bech32m", label: "P2TR · Taproot", format: "bcrt1p…", vbytes: "~58 vB / input" },
];

export default function UtxoScriptInspector() {
  const [utxoInfo, setUtxoInfo] = useState<UtxoSetInfo | null>(null);
  const [walletUtxos, setWalletUtxos] = useState<{ Miner: WalletUtxo[]; Trader: WalletUtxo[] }>({
    Miner: [],
    Trader: [],
  });
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState<AddressType | null>(null);
  const [generatedAddresses, setGeneratedAddresses] = useState<GeneratedAddress[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchUtxoInfo = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const result = await postAction<{
        utxoInfo: UtxoSetInfo;
        minerUtxos: WalletUtxo[];
        traderUtxos: WalletUtxo[];
      }>("get_utxo_set_info");
      setUtxoInfo(result.utxoInfo);
      setWalletUtxos({ Miner: result.minerUtxos, Trader: result.traderUtxos });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible de charger les UTXO");
    } finally {
      setLoading(false);
    }
  };

  const generateAddress = async (type: AddressType) => {
    setGenerating(type);
    setErrorMessage(null);
    try {
      const result = await postAction<{ address: string }>("generate_script_address", { addressType: type });
      setGeneratedAddresses((previous) => [{ type, address: result.address }, ...previous]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Impossible de générer l'adresse");
    } finally {
      setGenerating(null);
    }
  };

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
            <CardTitle className="text-purple-400">UTXO Set global et portefeuilles</CardTitle>
            <CardDescription>Données RPC : gettxoutsetinfo et listunspent pour Miner et Trader.</CardDescription>
          </div>
          <Button onClick={fetchUtxoInfo} disabled={loading} size="sm" className="bg-purple-600 hover:bg-purple-500">
            {loading ? "Chargement..." : "Actualiser les UTXO"}
          </Button>
        </CardHeader>
        {utxoInfo && (
          <CardContent className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
            <Metric label="Hauteur du snapshot" value={utxoInfo.height.toLocaleString()} />
            <Metric label="Sorties non dépensées" value={utxoInfo.txouts.toLocaleString()} />
            <Metric label="Montant UTXO total" value={`${utxoInfo.total_amount.toFixed(8)} BTC`} />
            <Metric label="Taille disque" value={`${(utxoInfo.disk_size / 1024 / 1024).toFixed(2)} MB`} />
          </CardContent>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {(["Miner", "Trader"] as const).map((walletName) => (
          <Card key={walletName} className="border-slate-800 bg-slate-900">
            <CardHeader>
              <CardTitle className={walletName === "Miner" ? "text-emerald-400" : "text-blue-400"}>
                UTXO du wallet {walletName} ({walletUtxos[walletName].length})
              </CardTitle>
              <CardDescription>
                Valeur, confirmations, adresse et scriptPubKey des sorties non dépensées.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {walletUtxos[walletName].length === 0 ? (
                <p className="text-sm text-slate-500">
                  {utxoInfo ? "Aucun UTXO trouvé pour ce wallet." : "Clique sur « Actualiser les UTXO » pour charger les données."}
                </p>
              ) : (
                walletUtxos[walletName].map((utxo) => (
                  <div key={`${utxo.txid}:${utxo.vout}`} className="space-y-2 rounded border border-slate-800 bg-slate-950 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="break-all text-slate-400">{utxo.txid}:{utxo.vout}</span>
                      <span className="font-bold text-amber-300">{utxo.amount.toFixed(8)} BTC</span>
                    </div>
                    <div className="flex flex-wrap gap-2 text-slate-400">
                      <Badge variant="outline">{utxo.confirmations} confirmation(s)</Badge>
                      <Badge variant="outline">{utxo.spendable ? "Dépensable" : "Non dépensable"}</Badge>
                      {!utxo.safe && <Badge variant="outline">Non sécurisé</Badge>}
                      {utxo.label && <Badge variant="outline">{utxo.label}</Badge>}
                    </div>
                    <div className="break-all text-slate-400">
                      <span className="text-slate-500">Adresse : </span>{utxo.address || "script sans adresse"}
                    </div>
                    <div className="break-all text-[10px] text-slate-500">
                      <span className="text-slate-400">scriptPubKey : </span>{utxo.scriptPubKey}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-800 bg-slate-900">
        <CardHeader>
          <CardTitle className="text-emerald-400">Formats d’adresses et scripts</CardTitle>
          <CardDescription>Génère des adresses regtest dans le wallet Trader pour comparer les formats.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {addressTypes.map(({ type, label }) => (
              <Button
                key={type}
                onClick={() => void generateAddress(type)}
                disabled={generating !== null}
                size="sm"
                variant="outline"
                className="border-slate-700 text-slate-300"
              >
                {generating === type ? "Génération..." : label}
              </Button>
            ))}
          </div>
          <div className="space-y-2">
            {generatedAddresses.length === 0 ? (
              <p className="text-sm text-slate-500">Les adresses générées apparaîtront ici.</p>
            ) : (
              generatedAddresses.map((item, index) => {
                const info = addressTypes.find(({ type }) => type === item.type);
                return (
                  <div key={`${item.address}-${index}`} className="flex flex-col justify-between gap-2 rounded border border-slate-800 bg-slate-950 p-3 text-xs sm:flex-row sm:items-center">
                    <div className="space-y-1">
                      <Badge variant="outline">{info?.label}</Badge>
                      <div className="break-all text-slate-300">{item.address}</div>
                    </div>
                    <span className="shrink-0 text-slate-500">{info?.vbytes} · {info?.format}</span>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950 p-3">
      <span className="block text-slate-500">{label}</span>
      <span className="text-sm font-bold text-slate-200">{value}</span>
    </div>
  );
}
