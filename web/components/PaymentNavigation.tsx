"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const paymentLinks = [
  { href: "/payments", label: "Parcours" },
  { href: "/payments/receive", label: "Recevoir" },
  { href: "/payments/convert", label: "Convertir" },
  { href: "/payments/settle", label: "Régler" },
];

export default function PaymentNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="Modules de paiement" className="mb-6 flex gap-2 overflow-x-auto border-b border-slate-800 pb-3">
      {paymentLinks.map(({ href, label }) => (
        <Link
          key={href}
          href={href}
          aria-current={pathname === href ? "page" : undefined}
          className={`shrink-0 rounded px-3 py-2 text-sm ${
            pathname === href ? "bg-emerald-900/60 text-emerald-300" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
