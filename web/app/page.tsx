'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Coins, ArrowRight, Key, Send, Cpu, CheckCircle2, ShieldCheck, Database } from 'lucide-react';

export default function SeminarDashboard() {
  const [utxos, setUtxos] = useState<any[]>([]);
  const [selectedUtxo, setSelectedUtxo] = useState<any>(null);
  const [recipientAddr, setRecipientAddr] = useState('bcrt1q86mlpeyra40dr9qea6637608k9hqqajqsqywx3');
  const [amount, setAmount] = useState('10');
  const [fee, setFee] = useState('0.0001');

  // Tx States
  const [rawTxHex, setRawTxHex] = useState('');
  const [decodedTx, setDecodedTx] = useState<any>(null);
  const [signedTxHex, setSignedTxHex] = useState('');
  const [broadcastTxId, setBroadcastTxId] = useState('');
  const [minedBlockHash, setMinedBlockHash] = useState('');

  const API_BASE = 'http://localhost:3001/api';

  useEffect(() => {
    fetchUtxos();
  }, []);

  const fetchUtxos = async () => {
    try {
      const res = await fetch(`${API_BASE}/utxos`);
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setUtxos(data);
        setSelectedUtxo(data[0]);
      }
    } catch (err) {
      console.error("Erreur récupération UTXOs", err);
    }
  };

  const handleCreateTx = async () => {
    if (!selectedUtxo) return;
    const changeAmount = selectedUtxo.amount - parseFloat(amount) - parseFloat(fee);
    const inputs = [{ txid: selectedUtxo.txid, vout: selectedUtxo.vout }];
    const outputs = {
      [recipientAddr]: parseFloat(amount),
      "bcrt1qhww3sj0g736nwxryxggwwvu68k9ql7ldggcj09": changeAmount
    };

    const res = await fetch(`${API_BASE}/create-raw-tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs, outputs })
    });
    const data = await res.json();
    setRawTxHex(data.hex);
    decodeTx(data.hex);
  };

  const decodeTx = async (hex: string) => {
    const res = await fetch(`${API_BASE}/decode-raw-tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hex })
    });
    const data = await res.json();
    setDecodedTx(data);
  };

  const handleSignTx = async () => {
    const res = await fetch(`${API_BASE}/sign-raw-tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hex: rawTxHex })
    });
    const data = await res.json();
    setSignedTxHex(data.hex);
    decodeTx(data.hex);
  };

  const handleBroadcast = async () => {
    const res = await fetch(`${API_BASE}/send-raw-tx`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hex: signedTxHex })
    });
    const data = await res.json();
    setBroadcastTxId(data.txid);
  };

  const handleMineBlock = async () => {
    const res = await fetch(`${API_BASE}/mine`, { method: 'POST' });
    const data = await res.json();
    setMinedBlockHash(data.blockHash);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <header className="mb-8 border-b border-slate-800 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-amber-500">
            <Coins className="h-7 w-7" /> Séminaire Socratique #16 — Genesis Bar
          </h1>
          <p className="text-slate-400 text-sm">Atelier pratique : Construction & Signature manuelle d'une transaction Bitcoin</p>
        </div>
        <Badge variant="outline" className="border-amber-500 text-amber-400 bg-amber-500/10 px-3 py-1">
          Réseau Regtest Local
        </Badge>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Colonne Gauche : Sélection UTXO & Configuration */}
        <Card className="bg-slate-900 border-slate-800 text-slate-100">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-400" /> 1. Sélection de l'UTXO
            </CardTitle>
            <CardDescription className="text-slate-400">UTXOs non dépensés du portefeuille Miner</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedUtxo && (
              <div className="p-3 bg-slate-850 rounded border border-slate-700 text-xs space-y-1">
                <div className="text-slate-400">TxID Source:</div>
                <div className="font-mono text-amber-300 truncate">{selectedUtxo.txid}</div>
                <div className="flex justify-between pt-2">
                  <span>Vout: <strong>{selectedUtxo.vout}</strong></span>
                  <span className="text-emerald-400 font-bold">{selectedUtxo.amount} BTC</span>
                </div>
              </div>
            )}

            <Separator className="bg-slate-800" />

            <div className="space-y-3 text-sm">
              <label className="text-slate-300 font-medium">Adresse Destinataire (Trader)</label>
              <Input 
                value={recipientAddr} 
                onChange={(e) => setRecipientAddr(e.target.value)}
                className="bg-slate-950 border-slate-700 text-xs font-mono" 
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-300 font-medium">Montant (BTC)</label>
                  <Input value={amount} onChange={(e) => setAmount(e.target.value)} className="bg-slate-950 border-slate-700" />
                </div>
                <div>
                  <label className="text-slate-300 font-medium">Frais (BTC)</label>
                  <Input value={fee} onChange={(e) => setFee(e.target.value)} className="bg-slate-950 border-slate-700" />
                </div>
              </div>
            </div>

            <Button onClick={handleCreateTx} className="w-full bg-blue-600 hover:bg-blue-500 mt-4">
              <ArrowRight className="mr-2 h-4 w-4" /> Construire (createrawtransaction)
            </Button>
          </CardContent>
        </Card>

        {/* Colonne Milieu : Hex & Signature */}
        <Card className="bg-slate-900 border-slate-800 text-slate-100 lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Key className="h-5 w-5 text-amber-400" /> 2. Signature & Inspection Cryptographique
            </CardTitle>
            <CardDescription className="text-slate-400">Transformation du Hex non signé vers le Hex signé (Witness SegWit)</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Tabs defaultValue="raw" className="w-full">
              <TabsList className="bg-slate-950 border border-slate-800">
                <TabsTrigger value="raw">Transaction Brute</TabsTrigger>
                <TabsTrigger value="signed" disabled={!signedTxHex}>Transaction Signée</TabsTrigger>
                <TabsTrigger value="decoded" disabled={!decodedTx}>Structure JSON</TabsTrigger>
              </TabsList>

              <TabsContent value="raw" className="space-y-3 mt-4">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded font-mono text-xs break-all text-slate-300 max-h-32 overflow-y-auto">
                  {rawTxHex || "// En attente de création..."}
                </div>
                <Button onClick={handleSignTx} disabled={!rawTxHex} className="bg-amber-600 hover:bg-amber-500">
                  <ShieldCheck className="mr-2 h-4 w-4" /> Signer avec le Wallet (signrawtransactionwithwallet)
                </Button>
              </TabsContent>

              <TabsContent value="signed" className="space-y-3 mt-4">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded font-mono text-xs break-all text-emerald-400 max-h-32 overflow-y-auto">
                  {signedTxHex}
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleBroadcast} className="bg-emerald-600 hover:bg-emerald-500">
                    <Send className="mr-2 h-4 w-4" /> Diffuser (sendrawtransaction)
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="decoded" className="mt-4">
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded font-mono text-xs text-blue-300 max-h-48 overflow-y-auto">
                  {JSON.stringify(decodedTx, null, 2)}
                </pre>
              </TabsContent>
            </Tabs>

            <Separator className="bg-slate-800 my-4" />

            {/* Section Mempool & Minage */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                <div className="text-xs text-slate-400 font-semibold flex items-center gap-1">
                  <Send className="h-3 w-3 text-emerald-400" /> Statut Mempool
                </div>
                {broadcastTxId ? (
                  <div className="space-y-1">
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20">En Mempool</Badge>
                    <div className="text-[10px] font-mono text-slate-400 truncate">TxID: {broadcastTxId}</div>
                  </div>
                ) : (
                  <span className="text-xs text-slate-600">Aucune transaction diffusée</span>
                )}
              </div>

              <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                <div className="text-xs text-slate-400 font-semibold flex items-center gap-1">
                  <Cpu className="h-3 w-3 text-purple-400" /> Confirmation Block
                </div>
                {minedBlockHash ? (
                  <div className="space-y-1">
                    <Badge className="bg-purple-500/10 text-purple-400 border-purple-500/20">Confirmée (1 bloc)</Badge>
                    <div className="text-[10px] font-mono text-slate-400 truncate">BlockHash: {minedBlockHash}</div>
                  </div>
                ) : (
                  <Button onClick={handleMineBlock} disabled={!broadcastTxId} size="sm" variant="outline" className="border-purple-500 text-purple-300 hover:bg-purple-950">
                    Miner 1 Bloc
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}