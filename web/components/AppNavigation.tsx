"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Vue d’ensemble" },
  { href: "/mempool", label: "Mempool" },
  { href: "/utxo", label: "UTXO" },
  { href: "/consensus", label: "Consensus" },
  { href: "/blocks", label: "Blocs" },
  { href: "/payments", label: "Paiements" },
];

export default function AppNavigation() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <Link href="/" className="flex items-center gap-2 font-semibold text-amber-400">
          <span aria-hidden="true">₿</span>
          <span>Regtest Studio</span>
        </Link>
        <nav aria-label="Navigation principale" className="flex gap-1 overflow-x-auto">
          {links.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded px-3 py-2 text-sm transition-colors ${
                  active ? "bg-slate-800 text-amber-300" : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
