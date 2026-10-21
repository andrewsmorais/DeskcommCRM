import Link from "next/link";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

export function BillingBanner({ isActive, idioma }: { isActive: boolean; idioma: Idioma }) {
  if (isActive) return null;

  return (
    <div className="bg-red-600 text-white text-center py-2 text-sm font-medium z-50 relative shadow-sm">
      {traduzir("Assinatura inativa — confira", idioma)}{" "}
      <Link href="/app/settings/billing" className="underline hover:text-white/80 transition-colors">
        {traduzir("Plano e cobrança", idioma)}
      </Link>
    </div>
  );
}
