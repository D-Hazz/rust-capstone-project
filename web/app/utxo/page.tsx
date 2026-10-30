import PageHeading from "@/components/PageHeading";
import UtxoScriptInspector from "@/app/_components/UtxoScriptInspector";

export default function UtxoPage() {
  return (
    <div>
      <PageHeading title="UTXO & scripts" description="Sorties disponibles et formats d’adresses regtest." />
      <UtxoScriptInspector />
    </div>
  );
}
