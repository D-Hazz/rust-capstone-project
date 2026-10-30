import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PageHeading from "@/components/PageHeading";
import PaymentNavigation from "@/components/PaymentNavigation";

const steps = [
  { href: "/payments/receive", title: "1. Recevoir", description: "Créer une demande et suivre son paiement regtest." },
  { href: "/payments/convert", title: "2. Convertir", description: "Estimer BTC ↔ CDF, USD ou EUR avec taux spot." },
  { href: "/payments/settle", title: "3. Régler", description: "Régler sur la chaîne regtest vers le wallet Miner." },
];

export default function PaymentsPage() {
  return (
    <div>
      <PageHeading title="Paiements programmables" description="Réception, conversion et règlement en mode démo." />
      <PaymentNavigation />
      <div className="mb-5 rounded border border-amber-800/60 bg-amber-950/30 p-3 text-sm text-amber-200">
        Démonstration uniquement : les taux sont indicatifs. Aucun paiement fiat ni échange réel n’est effectué.
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {steps.map((step) => (
          <Link href={step.href} key={step.href}>
            <Card className="h-full border-slate-800 bg-slate-900 hover:border-slate-600">
              <CardHeader><CardTitle className="text-base text-emerald-300">{step.title}</CardTitle></CardHeader>
              <CardContent className="text-sm text-slate-400">{step.description}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
