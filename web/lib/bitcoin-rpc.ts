const RPC_URL = process.env.BITCOIN_RPC_URL || "http://127.0.0.1:18443";
const RPC_USER = process.env.BITCOIN_RPC_USER || "alice";
const RPC_PASS =
  process.env.BITCOIN_RPC_PASS ||
  process.env.BITCOIN_RPC_PASSWORD ||
  "password";

export class BitcoinRpcError extends Error {
  constructor(message: string, readonly code?: number) {
    super(message);
    this.name = "BitcoinRpcError";
  }
}

export async function bitcoinRpc<T = unknown>(
  method: string,
  params: unknown[] = [],
  walletName?: string,
): Promise<T> {
  const url = walletName
    ? `${RPC_URL}/wallet/${encodeURIComponent(walletName)}`
    : RPC_URL;
  const auth = Buffer.from(`${RPC_USER}:${RPC_PASS}`).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;",
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      jsonrpc: "1.0",
      id: "nextjs-dashboard",
      method,
      params,
    }),
    cache: "no-store",
  });

  const body = await response.text();
  let data: { result: T; error: { code?: number; message?: string } | null };
  try {
    data = JSON.parse(body);
  } catch {
    if (!response.ok) {
      throw new Error(`Bitcoin RPC HTTP ${response.status}: ${body || response.statusText}`);
    }
    throw new Error("Bitcoin RPC a renvoyé une réponse JSON invalide");
  }
  if (data.error) {
    throw new BitcoinRpcError(
      data.error.message || "Erreur RPC Bitcoin",
      data.error.code,
    );
  }
  if (!response.ok) {
    throw new Error(`Bitcoin RPC HTTP ${response.status}: ${body || response.statusText}`);
  }
  return data.result;
}