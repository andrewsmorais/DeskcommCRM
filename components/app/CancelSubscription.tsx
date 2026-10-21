"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR, es, enUS } from "date-fns/locale";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

function getLocale(idioma: string) {
  if (idioma === "en-US") return enUS;
  if (idioma === "es") return es;
  return ptBR;
}

export function CancelSubscription({
  status,
  currentPeriodEnd,
  idioma,
  suporteUrl,
}: {
  status: string;
  currentPeriodEnd: string | null | undefined;
  idioma: Idioma;
  suporteUrl: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const router = useRouter();

  const t = (text: string) => traduzir(text, idioma);
  const isCanceled = status === "canceled";

  const formatDate = (date: string) =>
    format(new Date(date), "dd 'de' MMMM 'de' yyyy", { locale: getLocale(idioma) });

  async function handleCancel() {
    setIsCanceling(true);
    try {
      const res = await fetch("/api/v1/billing/cancel", { method: "POST" });
      if (res.ok) {
        setIsOpen(false);
        router.refresh(); // Refresh the server component to get new billing status
      } else {
        const body = await res.json().catch(() => null);
        alert(
          body?.error?.message ??
            "Não foi possível confirmar o cancelamento. Atualize a página para conferir.",
        );
      }
    } catch {
      alert("Erro ao cancelar.");
    } finally {
      setIsCanceling(false);
    }
  }

  if (isCanceled) {
    return (
      <div className="mt-4 flex flex-col items-start gap-2 md:col-span-2">
        <p className="text-sm font-medium text-red-600">
          {t("Assinatura cancelada.")}{" "}
          {currentPeriodEnd && `${t("Acesso até")} ${formatDate(currentPeriodEnd)}.`}
        </p>
        <Button asChild variant="outline">
          <a href="https://chataionline.io/#precos" target="_blank" rel="noopener noreferrer">
            {t("Ver planos")}
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-4 md:col-span-2">
      {!isOpen ? (
        <Button
          variant="ghost"
          onClick={() => setIsOpen(true)}
          className="text-sm text-muted-foreground hover:text-red-500"
        >
          {t("Cancelar assinatura")}
        </Button>
      ) : (
        <div className="flex flex-col items-start gap-4 rounded-md border bg-slate-50 p-4">
          <p className="text-sm font-medium">{t("Quer falar com a gente antes de cancelar?")}</p>
          <div className="flex items-center gap-4">
            <Button asChild variant="outline">
              <a href={suporteUrl} target="_blank" rel="noopener noreferrer">
                {t("Falar com o suporte")}
              </a>
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isCanceling}>
              {isCanceling ? "..." : t("Cancelar agora")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
