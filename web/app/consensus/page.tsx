"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeading from "@/components/PageHeading";
import ReorgAndWeightSimulator from "@/app/_components/ReorgAndWeightSimulator";

interface ChainState {
  chain: string;
  blocks: number;
  bestblockhash: string;
}

export default function ConsensusPage() {
  const [chain, setChain] = useState<ChainState | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/bitcoin", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Nœud indisponible");
      setChain(result);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Nœud indisponible");
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  return (
    <div>
      <PageHeading
        title="Consensus"
        description={chain ? `${chain.chain} · hauteur ${chain.blocks}` : "État de la chaîne"}
      />
      {errorMessage && <p role="alert" className="mb-4 text-sm text-red-300">{errorMessage}</p>}
      {chain && <ReorgAndWeightSimulator bestBlockHash={chain.bestblockhash} onChainChanged={refresh} />}
    </div>
  );
}
