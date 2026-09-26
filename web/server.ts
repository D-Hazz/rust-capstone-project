import express from 'express';
import cors from 'cors';
import RpcClient from 'bitcoincore-rpc';

const app = express();
app.use(cors());
app.use(express.json());

const rpcConfig = {
  protocol: 'http',
  user: 'alice',
  pass: 'password',
  host: '127.0.0.1',
  port: '18443',
};

const getRpc = (wallet?: string) => {
  const config = { ...rpcConfig };
  if (wallet) {
    (config as any).path = `/wallet/${wallet}`;
  }
  return new RpcClient(config);
};

// 1. Lister les UTXOs du Miner
app.get('/api/utxos', (req, res) => {
  const rpc = getRpc('Miner');
  rpc.listUnspent(1, 9999999, (err: any, response: any) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(response.result);
  });
});

// 2. Créer la transaction brute
app.post('/api/create-raw-tx', (req, res) => {
  const { inputs, outputs } = req.body;
  const rpc = getRpc();
  rpc.createRawTransaction(inputs, outputs, (err: any, response: any) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ hex: response.result });
  });
});

// 3. Décoder la transaction (avant/après signature)
app.post('/api/decode-raw-tx', (req, res) => {
  const { hex } = req.body;
  const rpc = getRpc();
  rpc.decodeRawTransaction(hex, (err: any, response: any) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(response.result);
  });
});

// 4. Signer la transaction
app.post('/api/sign-raw-tx', (req, res) => {
  const { hex } = req.body;
  const rpc = getRpc('Miner');
  rpc.signRawTransactionWithWallet(hex, (err: any, response: any) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(response.result);
  });
});

// 5. Diffuser la transaction (Broadcast)
app.post('/api/send-raw-tx', (req, res) => {
  const { hex } = req.body;
  const rpc = getRpc();
  rpc.sendRawTransaction(hex, (err: any, response: any) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ txid: response.result });
  });
});

// 6. Miner un bloc sur Regtest
app.post('/api/mine', (req, res) => {
  const minerRpc = getRpc('Miner');
  minerRpc.getNewAddress((err: any, addrResp: any) => {
    if (err) return res.status(500).json({ error: err.message });
    const rpc = getRpc();
    rpc.generateToAddress(1, addrResp.result, (genErr: any, genResp: any) => {
      if (genErr) return res.status(500).json({ error: genErr.message });
      res.json({ blockHash: genResp.result[0] });
    });
  });
});

app.listen(3001, () => {
  console.log('🚀 Serveur API Bitcoin Regtest démarré sur http://localhost:3001');
});