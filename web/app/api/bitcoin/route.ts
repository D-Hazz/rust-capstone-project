import { NextResponse } from "next/server";
import { bitcoinRpc } from "@/lib/bitcoin-rpc";
import { ensureDashboardWallets } from "@/lib/bitcoin-wallets";

interface BlockchainInfo {
  blocks: number;
  chain: string;
  bestblockhash: string;
}

interface MempoolInfo {
  size: number;
}

interface MempoolEntry {
  vsize: number;
  fees: { base: number };
  depends?: string[];
  "bip125-replaceable"?: boolean;
}

interface BlockSummary {
  hash: string;
  height: number;
  time: number;
  nTx: number;
  size: number;
  weight: number;
}

interface DecodedBlock extends BlockSummary {
  version: number;
  versionHex: string;
  merkleroot: string;
  mediantime: number;
  nonce: number;
  bits: string;
  difficulty: number;
  previousblockhash?: string;
  tx: Array<{
    txid: string;
    hash: string;
    size: number;
    vsize: number;
    weight: number;
    fee?: number;
    vin: Array<{ txid?: string; vout?: number; coinbase?: string }>;
    vout: Array<{
      value: number;
      n: number;
      scriptPubKey: { address?: string; type: string; hex: string };
    }>;
  }>;
}

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

// ------------------------------------------------------------------
// 1. GESTIONNAIRE GET : Utilisé par fetchNodeState() dans page.tsx
// ------------------------------------------------------------------
export async function GET() {
  try {
    await ensureDashboardWallets();
    const [blockchainInfo, mempoolInfo, rawMempool, minerBalance, traderBalance] =
      await Promise.all([
        bitcoinRpc<BlockchainInfo>("getblockchaininfo"),
        bitcoinRpc<MempoolInfo>("getmempoolinfo"),
        bitcoinRpc<Record<string, MempoolEntry>>("getrawmempool", [true]),
        bitcoinRpc<number>("getbalance", [], "Miner"),
        bitcoinRpc<number>("getbalance", [], "Trader"),
      ]);

    return NextResponse.json({
      blocks: blockchainInfo.blocks,
      chain: blockchainInfo.chain,
      bestblockhash: blockchainInfo.bestblockhash,
      mempoolSize: mempoolInfo.size,
      mempoolTxids: Object.entries(rawMempool).map(([txid, entry]) => ({
        txid,
        vsize: entry.vsize,
        feeRate: entry.vsize > 0 ? (entry.fees.base * 100_000_000) / entry.vsize : 0,
        replaceable: entry["bip125-replaceable"] ?? false,
      })),
      minerBalance,
      traderBalance,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur Bitcoin RPC inconnue";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// ------------------------------------------------------------------
// 2. GESTIONNAIRE POST : Pour les actions RBF, UTXO, Reorg, Minage, etc.
// ------------------------------------------------------------------
export async function POST(req: Request) {
  try {
    await ensureDashboardWallets();
    const { action, payload } = await req.json();

    switch (action) {
      // --- ACTIONS DE BASE (MINAGE & TRANSFERTS) ---
      case "generate_blocks": {
        const { count } = payload;
        if (!Number.isInteger(count) || count < 1 || count > 1000) {
          return NextResponse.json(
            { error: "Le nombre de blocs doit être un entier entre 1 et 1000" },
            { status: 400 },
          );
        }
        const address = await bitcoinRpc<string>("getnewaddress", ["", "bech32"], "Miner");
        const blocks = await bitcoinRpc<string[]>("generatetoaddress", [count, address]);
        return NextResponse.json({ blocks });
      }

      case "send_miner_to_trader": {
        const { amount } = payload;
        if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
          return NextResponse.json({ error: "Le montant doit être un nombre positif" }, { status: 400 });
        }
        const traderAddress = await bitcoinRpc<string>("getnewaddress", ["", "bech32"], "Trader");
        const txid = await bitcoinRpc<string>("sendtoaddress", [traderAddress, amount], "Miner");
        return NextResponse.json({ txid });
      }

      case "get_mempool_entry": {
        const { txid } = payload;
        const entry = await bitcoinRpc<MempoolEntry>("getmempoolentry", [txid]);
        return NextResponse.json({ entry });
      }

      case "get_recent_blocks": {
        const { count = 8 } = payload ?? {};
        if (!Number.isInteger(count) || count < 1 || count > 20) {
          return NextResponse.json({ error: "Le nombre de blocs doit être entre 1 et 20" }, { status: 400 });
        }
        const { blocks: height } = await bitcoinRpc<BlockchainInfo>("getblockchaininfo");
        const firstHeight = Math.max(0, height - count + 1);
        const hashes = await Promise.all(
          Array.from({ length: height - firstHeight + 1 }, (_, index) =>
            bitcoinRpc<string>("getblockhash", [firstHeight + index]),
          ),
        );
        const blocks = await Promise.all(
          hashes.map((hash) => bitcoinRpc<BlockSummary>("getblock", [hash, 1])),
        );
        return NextResponse.json({ blocks: blocks.reverse() });
      }

      case "get_block_details": {
        const { hash } = payload ?? {};
        if (typeof hash !== "string" || !/^[0-9a-f]{64}$/i.test(hash)) {
          return NextResponse.json({ error: "Hash de bloc invalide" }, { status: 400 });
        }
        const block = await bitcoinRpc<DecodedBlock>("getblock", [hash, 2]);
        return NextResponse.json({ block });
      }

      // --- 1. RBF & TRANSACTION RANGES ---
      case "send_rbf_transaction": {
        const { amount, feeRate } = payload; // feeRate en sat/vB
        if (
          typeof feeRate !== "number" ||
          !Number.isFinite(feeRate) ||
          feeRate <= 0 ||
          typeof amount !== "number" ||
          !Number.isFinite(amount) ||
          amount <= 0 ||
          typeof payload.targetAddress !== "string" ||
          payload.targetAddress.length === 0
        ) {
          return NextResponse.json({ error: "Adresse, montant ou taux de frais invalide" }, { status: 400 });
        }
        const txid = await bitcoinRpc<string>(
          "sendtoaddress",
          [
            payload.targetAddress,
            amount,
            "",
            "",
            false,
            true,
            null,
            "unset",
            false,
            feeRate / 100_000,
          ],
          "Miner",
        );
        return NextResponse.json({ txid });
      }

      case "bump_fee": {
        const { txid, newFeeRate } = payload;
        if (
          typeof txid !== "string" ||
          typeof newFeeRate !== "number" ||
          !Number.isFinite(newFeeRate) ||
          newFeeRate <= 0
        ) {
          return NextResponse.json({ error: "TxID ou taux de frais invalide" }, { status: 400 });
        }
        const res = await bitcoinRpc<{ txid: string; origfee: number; fee: number }>(
          "bumpfee",
          [txid, { fee_rate: newFeeRate / 100_000 }],
          "Miner",
        );
        return NextResponse.json({ newTxid: res.txid, origFee: res.origfee, newFee: res.fee });
      }

      // --- 2. UTXO SET & ADDRESS TYPES ---
      case "get_utxo_set_info": {
        const [utxoInfo, minerUtxos, traderUtxos] = await Promise.all([
          bitcoinRpc<UtxoSetInfo>("gettxoutsetinfo"),
          bitcoinRpc<WalletUtxo[]>("listunspent", [0, 9999999], "Miner"),
          bitcoinRpc<WalletUtxo[]>("listunspent", [0, 9999999], "Trader"),
        ]);
        return NextResponse.json({ utxoInfo, minerUtxos, traderUtxos });
      }

      case "generate_script_address": {
        const { addressType } = payload; // "legacy" | "p2sh-segwit" | "bech32" | "bech32m"
        if (!["legacy", "p2sh-segwit", "bech32", "bech32m"].includes(addressType)) {
          return NextResponse.json({ error: "Type d'adresse Bitcoin invalide" }, { status: 400 });
        }
        const address = await bitcoinRpc<string>("getnewaddress", ["label", addressType], "Trader");
        return NextResponse.json({ address, addressType });
      }

      // --- 3. REORG & BLOCK WEIGHT ---
      case "simulate_reorg": {
        const chainInfo = await bitcoinRpc<BlockchainInfo>("getblockchaininfo");
        if (chainInfo.chain !== "regtest") {
          return NextResponse.json(
            { error: "La simulation de réorganisation est limitée au réseau regtest" },
            { status: 400 },
          );
        }
        if (chainInfo.blocks < 2) {
          return NextResponse.json(
            { error: "Il faut au moins deux blocs pour simuler une réorganisation" },
            { status: 400 },
          );
        }
        const bestHash = await bitcoinRpc<string>("getbestblockhash");
        await bitcoinRpc("invalidateblock", [bestHash]);
        const newAddress = await bitcoinRpc<string>("getnewaddress", ["", "bech32"], "Miner");
        const newBlocks = await bitcoinRpc<string[]>("generatetoaddress", [2, newAddress]);
        const [newBestHash, mempoolTxids] = await Promise.all([
          bitcoinRpc<string>("getbestblockhash"),
          bitcoinRpc<string[]>("getrawmempool"),
        ]);
        return NextResponse.json({
          invalidatedHash: bestHash,
          invalidatedHeight: chainInfo.blocks,
          newBlocks,
          newBestHash,
          mempoolTxids,
        });
      }

      case "get_block_weight": {
        const { hash } = payload;
        const block = await bitcoinRpc<{ hash: string; height: number; size: number; weight: number }>(
          "getblock",
          [hash, 1],
        );
        const weight = block.weight;
        const maxWeight = 4000000;
        return NextResponse.json({
          hash: block.hash,
          height: block.height,
          size: block.size,
          weight,
          maxWeight,
          percentage: ((weight / maxWeight) * 100).toFixed(2),
        });
      }

      default:
        return NextResponse.json({ error: "Action non reconnue" }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur Bitcoin RPC inconnue";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}