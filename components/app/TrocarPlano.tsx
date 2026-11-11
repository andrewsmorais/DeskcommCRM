"use client";

/**
 * Trocar de plano (Essencial ↔ Impulso) pela tela de Plano e cobrança.
 *
 * O que aparece antes do clique é a mesma conta que a rota faz
 * (`lib/billing/troca-de-plano.ts`, calculada no servidor): quanto se paga
 * agora, a partir de quando vale e o valor das próximas cobranças. A rota
 * refaz a conta no momento do pedido — o texto aqui é a prévia, não o contrato.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { TrocaDePlano } from "@/lib/billing";
import { MENSAGEM_DA_RECUSA, type DecisaoDeTroca } from "@/lib/billing/troca-de-plano";
import { traduzir } from "@/lib/i18n/dicionario";
import { localeDeData } from "@/lib/i18n/datas";
import type { Idioma } from "@/lib/i18n/idiomas";

export type OpcaoDeTroca = {
  slug: "essencial" | "impulso";
  nome: string;
  valorDoCicloCents: number;
  decisao: DecisaoDeTroca;
};

const NOMES: Record<string, string> = { essencial: "Essencial", impulso: "Impulso" };

export function TrocarPlano({
  idioma,
  planoAtual,
  cicloRotulo,
  troca,
  opcoes,
  suporteUrl,
}: {
  idioma: Idioma;
  planoAtual: string;
  cicloRotulo: string;
  troca: TrocaDePlano | null;
  opcoes: OpcaoDeTroca[];
  suporteUrl: string;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const t = (texto: string) => traduzir(texto, idioma);
  const reais = (cents: number) =>
    (cents / 100).toLocaleString(idioma === "es" ? "es" : "pt-BR", {
      style: "currency",
      currency: "BRL",
    });
  const data = (iso: string) =>
    format(new Date(iso), "dd 'de' MMMM 'de' yyyy", { locale: localeDeData(idioma) });

  async function pedir(slug: string) {
    setEnviando(true);
    try {
      const res = await fetch("/api/v1/billing/trocar-plano", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plano: slug }),
      });
      const corpo = (await res.json().catch(() => null)) as {
        data?: { link?: string | null; aplicado_agora?: boolean; tipo?: string };
        error?: { message?: string };
      } | null;
      if (!res.ok) {
        toast.error(t(corpo?.error?.message ?? "Não foi possível trocar de plano agora."));
        return;
      }
      if (corpo?.data?.link) {
        window.open(corpo.data.link, "_blank", "noopener,noreferrer");
        toast.success(
          t(
            "Cobrança da diferença criada. O plano novo entra assim que o pagamento for confirmado.",
          ),
        );
      } else if (corpo?.data?.aplicado_agora) {
        toast.success(t("Plano trocado."));
      } else {
        toast.success(t("Troca agendada para o fim do período já pago."));
      }
      setConfirmando(null);
      router.refresh();
    } catch {
      toast.error(t("Não foi possível trocar de plano agora."));
    } finally {
      setEnviando(false);
    }
  }

  async function desistir() {
    setEnviando(true);
    try {
      const res = await fetch("/api/v1/billing/trocar-plano", { method: "DELETE" });
      const corpo = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        toast.error(t(corpo?.error?.message ?? "Não foi possível desistir da troca agora."));
        return;
      }
      toast.success(t("Troca de plano desfeita."));
      router.refresh();
    } catch {
      toast.error(t("Não foi possível desistir da troca agora."));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Card className="p-6 md:col-span-2" data-testid="trocar-plano">
      <h2 className="text-lg font-medium">{t("Trocar de plano")}</h2>

      {troca ? (
        <div className="mt-4 space-y-3 text-sm">
          {troca.tipo === "upgrade" ? (
            <>
              <p>
                {t("Aguardando o pagamento da diferença para o plano")}{" "}
                <span className="font-medium">{NOMES[troca.plano] ?? troca.plano}</span>
                {troca.valor_cents ? ` (${reais(troca.valor_cents)})` : ""}.{" "}
                {t("O plano muda assim que o pagamento for confirmado.")}
              </p>
              <div className="flex flex-wrap gap-3">
                {troca.link ? (
                  <Button asChild>
                    <a href={troca.link} target="_blank" rel="noopener noreferrer">
                      {t("Pagar a diferença")}
                    </a>
                  </Button>
                ) : null}
                <Button variant="outline" onClick={desistir} disabled={enviando}>
                  {enviando ? "..." : t("Desistir da troca")}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p>
                {t("Seu plano muda para o")}{" "}
                <span className="font-medium">{NOMES[troca.plano] ?? troca.plano}</span>{" "}
                {troca.efetiva_em ? `${t("em")} ${data(troca.efetiva_em)}` : ""}.{" "}
                {t(
                  "Até lá, tudo do plano atual continua liberado, e a próxima cobrança já vem com o valor do plano novo. Nada do que você criou é apagado.",
                )}
              </p>
              <Button variant="outline" onClick={desistir} disabled={enviando}>
                {enviando ? "..." : `${t("Manter o plano")} ${NOMES[planoAtual] ?? planoAtual}`}
              </Button>
            </>
          )}
        </div>
      ) : (
        <ul className="mt-4 space-y-4">
          {opcoes.map((o) => {
            const d = o.decisao;
            return (
              <li key={o.slug} className="rounded-md border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium">{o.nome}</p>
                  <p className="text-sm text-muted-foreground">
                    {reais(o.valorDoCicloCents)} · {cicloRotulo}
                  </p>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {!d.ok
                    ? t(MENSAGEM_DA_RECUSA[d.motivo])
                    : d.aplicarAgora
                      ? `${t("A troca vale na hora, sem cobrança agora. As próximas cobranças vêm com o valor do plano novo.")}`
                      : d.tipo === "upgrade"
                        ? `${t("Você paga agora")} ${reais(d.valorCents)} — ${t("a diferença proporcional aos dias que faltam no período")} (${d.diasRestantes}) — ${t("e o plano novo entra assim que o pagamento for confirmado.")}`
                        : `${t("Você continua no plano atual até")} ${d.efetivaEm ? data(d.efetivaEm) : ""}; ${t("depois, as cobranças vêm com o valor do plano novo. Não há devolução do período já pago, e nada do que você criou é apagado.")}`}
                </p>
                {d.ok ? (
                  confirmando === o.slug ? (
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Button onClick={() => pedir(o.slug)} disabled={enviando}>
                        {enviando ? "..." : t("Confirmar a troca")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setConfirmando(null)}
                        disabled={enviando}
                      >
                        {t("Voltar")}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      className="mt-3"
                      variant="outline"
                      onClick={() => setConfirmando(o.slug)}
                    >
                      {`${t("Mudar para o")} ${o.nome}`}
                    </Button>
                  )
                ) : null}
              </li>
            );
          })}
          <li className="text-sm text-muted-foreground">
            {t(
              "Precisa de mais números, agentes ou usuários? O Escala é contratado com a nossa equipe.",
            )}{" "}
            <a href={suporteUrl} target="_blank" rel="noopener noreferrer" className="underline">
              {t("Falar com o suporte")}
            </a>
          </li>
        </ul>
      )}
    </Card>
  );
}
