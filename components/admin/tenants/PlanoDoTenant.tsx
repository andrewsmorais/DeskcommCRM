"use client";

/**
 * Plano da organização no painel do dono da plataforma, os EXTRAS cobrados à
 * parte (prospecção, ligações, nota de voz) e o Escala por PROPOSTA — para o
 * cliente que precisa de mais do que o pacote do Escala do checkout. Os
 * números nascem no pacote base do Escala e só podem subir (a rota recusa abaixo).
 */
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";

type Limites = {
  whatsapp: number;
  agentes_ia: number;
  chatbots: number;
  pipelines: number;
  usuarios: number;
};

type Leitura = {
  assinatura: {
    plano: string | null;
    status: string | null;
    ate: string | null;
    no_asaas: boolean;
    valor_mensal_cents: number | null;
    extras?: string[];
  } | null;
  ativo: boolean;
  limites: Partial<Limites> | null;
  pacote_base_escala: Limites;
};

const CHAVES: (keyof Limites)[] = ["whatsapp", "agentes_ia", "chatbots", "pipelines", "usuarios"];
const EXTRAS = ["prospeccao", "ligacoes", "nota_de_voz"] as const;

function daquiUmMes(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function PlanoDoTenant({ organizationId }: { organizationId: string }) {
  const t = useT();
  const tagDeIdioma = useTagDeIdioma();
  // Rótulos literais em t(): a cerca de i18n recusa t() sobre variável.
  const rotulos: Record<keyof Limites, string> = {
    whatsapp: t("Números de WhatsApp"),
    agentes_ia: t("Agentes de IA"),
    chatbots: t("Chatbots ligados"),
    pipelines: t("Funis"),
    usuarios: t("Usuários"),
  };
  const [leitura, setLeitura] = React.useState<Leitura | null>(null);
  const [erro, setErro] = React.useState(false);
  const [limites, setLimites] = React.useState<Limites | null>(null);
  const [ate, setAte] = React.useState(daquiUmMes());
  const [valor, setValor] = React.useState("349,90");
  const [enviando, setEnviando] = React.useState(false);
  const [conflitoAsaas, setConflitoAsaas] = React.useState<string | null>(null);
  const [extras, setExtras] = React.useState<string[]>([]);
  const rotulosDosExtras: Record<(typeof EXTRAS)[number], string> = {
    prospeccao: t("Prospecção automática"),
    ligacoes: t("Ligações por IA e Cold Call"),
    nota_de_voz: t("Respostas da IA em nota de voz"),
  };

  const carregar = React.useCallback(async () => {
    const res = await fetch(`/api/v1/admin/tenants/${organizationId}/plano`);
    const corpo = await res.json().catch(() => null);
    if (!res.ok || !corpo?.data) {
      setErro(true);
      return;
    }
    const dados = corpo.data as Leitura;
    setLeitura(dados);
    setExtras(dados.assinatura?.extras ?? []);
    const base = dados.pacote_base_escala;
    const atuais = dados.assinatura?.plano === "escala" ? dados.limites : null;
    setLimites({
      whatsapp: atuais?.whatsapp ?? base.whatsapp,
      agentes_ia: atuais?.agentes_ia ?? base.agentes_ia,
      chatbots: atuais?.chatbots ?? base.chatbots,
      pipelines: atuais?.pipelines ?? base.pipelines,
      usuarios: atuais?.usuarios ?? base.usuarios,
    });
    if (dados.assinatura?.plano === "escala" && dados.assinatura.valor_mensal_cents != null) {
      setValor((dados.assinatura.valor_mensal_cents / 100).toFixed(2).replace(".", ","));
    }
  }, [organizationId]);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  async function ativar(substituir: boolean) {
    if (!limites) return;
    const cents = Math.round(Number(valor.replace(/\./g, "").replace(",", ".")) * 100);
    if (!Number.isFinite(cents) || cents < 0) {
      toast.error(t("Valor mensal inválido."));
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch(`/api/v1/admin/tenants/${organizationId}/plano`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ate,
          valor_mensal_cents: cents,
          limites,
          ...(substituir ? { substituir_assinatura_asaas: true } : {}),
        }),
      });
      const corpo = await res.json().catch(() => null);
      if (res.status === 409) {
        setConflitoAsaas(corpo?.error?.message ?? t("Há uma assinatura em vigor no Asaas."));
        return;
      }
      if (!res.ok) {
        toast.error(corpo?.error?.message ?? t("Não foi possível ativar o Escala."));
        return;
      }
      setConflitoAsaas(null);
      toast.success(t("Escala ativado."));
      await carregar();
    } finally {
      setEnviando(false);
    }
  }

  async function gravarExtras(proximos: string[]) {
    setEnviando(true);
    try {
      const res = await fetch(`/api/v1/admin/tenants/${organizationId}/plano`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extras: proximos }),
      });
      const corpo = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(corpo?.error?.message ?? t("Não foi possível gravar os extras."));
        return;
      }
      setExtras(proximos);
      toast.success(t("Extras atualizados."));
    } finally {
      setEnviando(false);
    }
  }

  if (erro) {
    return (
      <Card className="p-5 text-sm text-muted-foreground">
        {t("Não foi possível ler o plano desta organização.")}
      </Card>
    );
  }
  if (!leitura || !limites) return null;

  const base = leitura.pacote_base_escala;
  const a = leitura.assinatura;

  return (
    <Card className="space-y-5 p-5" data-testid="plano-do-tenant">
      <div>
        <h2 className="text-base font-semibold">{t("Plano")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {a?.plano
            ? `${a.plano} · ${a.status ?? "—"}${a.ate ? ` · ${t("até")} ${new Date(a.ate).toLocaleDateString(tagDeIdioma)}` : ""}${a.no_asaas ? ` · ${t("cobrado pelo Asaas")}` : ""}`
            : t("Sem assinatura.")}
          {!leitura.ativo && a?.plano ? ` · ${t("inativo")}` : ""}
        </p>
      </div>

      <div className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-semibold">{t("Extras cobrados à parte")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("Nenhum plano inclui estes recursos. Ligue só para quem contratou o extra com você.")}
        </p>
        {a ? (
          <div className="space-y-2">
            {EXTRAS.map((extra) => (
              <label key={extra} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={enviando}
                  checked={extras.includes(extra)}
                  data-testid={`extra-${extra}`}
                  onChange={(e) =>
                    void gravarExtras(
                      e.target.checked ? [...extras, extra] : extras.filter((x) => x !== extra),
                    )
                  }
                />
                {rotulosDosExtras[extra]}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("Esta organização ainda não tem plano. Os extras entram junto de um plano.")}
          </p>
        )}
      </div>

      <div className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-semibold">{t("Ativar o Escala (proposta fechada)")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("O Escala normal é contratado pela página de vendas. Use isto só para quem fechou uma proposta acima do pacote.")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {CHAVES.map((chave) => (
            <div key={chave} className="space-y-1">
              <Label htmlFor={`escala-${chave}`} className="text-xs">
                {rotulos[chave]}
              </Label>
              <Input
                id={`escala-${chave}`}
                type="number"
                min={base[chave]}
                max={1000}
                value={limites[chave]}
                onChange={(e) =>
                  setLimites((l) => (l ? { ...l, [chave]: Number(e.target.value) } : l))
                }
              />
              <p className="text-[11px] text-muted-foreground">
                {t("mínimo")} {base[chave]}
              </p>
            </div>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="escala-valor" className="text-xs">
              {t("Valor mensal combinado (R$)")}
            </Label>
            <Input id="escala-valor" value={valor} onChange={(e) => setValor(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="escala-ate" className="text-xs">
              {t("Ativo até")}
            </Label>
            <Input
              id="escala-ate"
              type="date"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
            />
          </div>
        </div>

        {conflitoAsaas ? (
          <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
            <p>{conflitoAsaas}</p>
            <Button
              size="sm"
              variant="outline"
              disabled={enviando}
              onClick={() => void ativar(true)}
            >
              {t("Já cancelei no Asaas — substituir")}
            </Button>
          </div>
        ) : null}

        <Button disabled={enviando} onClick={() => void ativar(false)} data-testid="ativar-escala">
          {a?.plano === "escala" ? t("Atualizar o Escala") : t("Ativar o Escala")}
        </Button>
      </div>
    </Card>
  );
}
