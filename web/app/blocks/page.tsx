"use client";

import { useEffect, useState } from "react";
import PageHeading from "@/components/PageHeading";
import BlockExplorer from "@/app/_components/BlockExplorer";

interface ChainState {
  blocks: number;
  bestblockhash: string;
}

export default function BlocksPage() {
  const [chain, setChain] = useState<ChainState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/bitcoin", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Nœud indisponible");
        if (active) {
          setChain(result);
          setErrorMessage(null);
        }
      } catch (error) {
        if (active) setErrorMessage(error instanceof Error ? error.message : "Nœud indisponible");
      }
    };
    const timer = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      window.clearTimeout(timer);
      window.clearInterval(interval);
    };
  }, []);

  return (
    <div>
      <PageHeading title="Explorateur de blocs" description={chain ? `Hauteur ${chain.blocks}` : "Blocs et transactions confirmées."} />
      {errorMessage && <p role="alert" className="mb-4 text-sm text-red-300">{errorMessage}</p>}
      {chain && <BlockExplorer currentBlockCount={chain.blocks} bestBlockHash={chain.bestblockhash} />}
    </div>
  );
}
