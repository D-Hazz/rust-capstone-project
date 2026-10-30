"use client";

import { useEffect, useState } from "react";
import PageHeading from "@/components/PageHeading";
import RbfMempoolVisualizer from "@/app/_components/RbfMempoolVisualizer";

interface MempoolState {
  mempoolTxids: Array<{ txid: string; vsize: number; feeRate: number; replaceable: boolean }>;
  minerBalance: number;
}

export default function MempoolPage() {
  const [state, setState] = useState<MempoolState>({ mempoolTxids: [], minerBalance: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/bitcoin", { cache: "no-store" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Nœud indisponible");
        if (active) {
          setState(result);
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
      <PageHeading title="Mempool & RBF" description="Suivi du mempool et remplacement de frais." />
      {errorMessage && <p role="alert" className="mb-4 text-sm text-red-300">{errorMessage}</p>}
      <RbfMempoolVisualizer mempoolTxids={state.mempoolTxids} minerBalance={state.minerBalance} />
    </div>
  );
}
