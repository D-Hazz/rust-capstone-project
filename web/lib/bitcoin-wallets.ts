import { bitcoinRpc } from "@/lib/bitcoin-rpc";

const DASHBOARD_WALLETS = ["Miner", "Trader"] as const;
let walletSetup: Promise<void> | null = null;

interface WalletDirectory {
  wallets: Array<{ name: string }>;
}

async function setupDashboardWallets(): Promise<void> {
  const [loadedWallets, walletDirectory] = await Promise.all([
    bitcoinRpc<string[]>("listwallets"),
    bitcoinRpc<WalletDirectory>("listwalletdir"),
  ]);
  const existingWallets = new Set(walletDirectory.wallets.map(({ name }) => name));

  for (const walletName of DASHBOARD_WALLETS) {
    if (loadedWallets.includes(walletName)) continue;
    if (existingWallets.has(walletName)) {
      await bitcoinRpc("loadwallet", [walletName]);
    } else {
      await bitcoinRpc("createwallet", [walletName]);
    }
  }
}

export async function ensureDashboardWallets(): Promise<void> {
  if (!walletSetup) {
    walletSetup = setupDashboardWallets().catch((error: unknown) => {
      walletSetup = null;
      throw error;
    });
  }
  await walletSetup;
}
