"use client";

/**
 * Conexão de conversões do TikTok, do Pinterest e do Taboola (migration 0567).
 *
 * Um formulário só, com o texto de cada plataforma, porque as três têm a mesma
 * forma da Meta — um "para onde" e, menos no Taboola, um token — e salvam pela
 * mesma ação (`updateAdPlatformConnection`). O token nunca volta para a tela:
 * vazio ao salvar quer dizer "mantenha o gravado".
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateAdPlatformConnection } from "@/app/actions/settings/updateAdPlatformConnection";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { EstadoDaConexao } from "@/lib/conversoes/estado-da-conexao";
import { traduzir } from "@/lib/i18n/dicionario";
import type { Idioma } from "@/lib/i18n/idiomas";

export type PlataformaDoFormulario = "tiktok_ads" | "pinterest_ads" | "taboola_ads";

const TEXTOS: Record<
  PlataformaDoFormulario,
  {
    titulo: string;
    explica: string;
    destino: string;
    ajudaDoDestino: string;
    exemplo: string;
    temToken: boolean;
    ajudaDoToken?: string;
    temTeste: boolean;
    minimo: number;
  }
> = {
  tiktok_ads: {
    titulo: "TikTok Ads",
    explica:
      "Quando um negócio de quem chegou por anúncio do TikTok é ganho, a venda volta para o pixel e o TikTok passa a otimizar para quem compra.",
    destino: "Código do pixel",
    ajudaDoDestino: "No Gerenciador de Eventos do TikTok: Pixels da web › o seu pixel. Letras e números.",
    exemplo: "C4ABCD1234EFGH5678",
    temToken: true,
    ajudaDoToken: "No mesmo pixel: Configurações › Events API › Gerar token de acesso.",
    temTeste: true,
    minimo: 6,
  },
  pinterest_ads: {
    titulo: "Pinterest Ads",
    explica:
      "Quando um negócio de quem chegou por anúncio do Pinterest é ganho, a venda volta para o Pinterest como compra (checkout).",
    destino: "ID da conta de anúncios",
    ajudaDoDestino: "No Pinterest Ads, no topo da tela da conta. Só números.",
    exemplo: "549755813599",
    temToken: true,
    ajudaDoToken: "Pinterest Ads › Gerenciador de conversões › Token de acesso da API de conversões.",
    temTeste: true,
    minimo: 5,
  },
  taboola_ads: {
    titulo: "Taboola Ads",
    explica:
      "Quando um negócio de quem chegou por anúncio do Taboola é ganho, a venda volta para o Taboola com o valor. O Taboola não pede token.",
    destino: "Nome do evento de conversão",
    ajudaDoDestino:
      "Crie no Taboola Ads uma conversão do tipo evento (por exemplo, com o nome purchase) e escreva aqui o mesmo nome, com as mesmas maiúsculas.",
    exemplo: "purchase",
    temToken: false,
    temTeste: false,
    minimo: 1,
  },
};

const ERRO: Record<string, string> = {
  validation_failed: "Confira os campos: algum valor não está no formato esperado.",
  unauthenticated: "Sua sessão expirou. Entre de novo.",
  forbidden_tenant: "Você não está em nenhuma organização ativa.",
  forbidden_role: "Só um administrador da organização pode mudar esta conexão.",
  mfa_required: "Confirme o segundo fator para salvar esta mudança.",
  cifra_indisponivel:
    "Esta instalação está sem a chave mestra de criptografia, e o token não foi gravado. Quem instalou o sistema precisa configurá-la — refazer o cadastro aqui não resolve.",
  erro_ao_gravar: "Não consegui gravar agora. Tente de novo em instantes.",
};

export function FormularioDeOutraPlataforma({
  plataforma,
  estado,
  idioma,
}: {
  plataforma: PlataformaDoFormulario;
  estado: EstadoDaConexao;
  idioma: Idioma;
}) {
  const t = (texto: string) => traduzir(texto, idioma);
  const txt = TEXTOS[plataforma];
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [destino, setDestino] = useState(estado.datasetId ?? "");
  const [token, setToken] = useState("");
  const [codigoDeTeste, setCodigoDeTeste] = useState(estado.testEventCode ?? "");
  const [habilitada, setHabilitada] = useState(estado.habilitada);
  const id = (campo: string) => `${plataforma}_${campo}`;

  const podeSalvar =
    destino.trim().length >= txt.minimo &&
    (!txt.temToken || estado.temToken || token.trim().length >= 20);

  function salvar(evento: React.FormEvent) {
    evento.preventDefault();
    startTransition(async () => {
      const r = await updateAdPlatformConnection({
        platform: plataforma,
        dataset_id: destino.trim(),
        access_token: txt.temToken ? token.trim() || undefined : undefined,
        test_event_code: txt.temTeste ? codigoDeTeste.trim() || null : null,
        enabled: habilitada,
      });
      if (r.ok) {
        setToken("");
        toast.success(t("Conexão salva."));
        router.refresh();
        return;
      }
      toast.error(t(ERRO[r.error] ?? "Não consegui salvar agora."));
    });
  }

  return (
    <Card className="p-6">
      <form onSubmit={salvar} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h3 className="text-base font-semibold">{txt.titulo}</h3>
          <p className="text-sm text-muted-foreground">{t(txt.explica)}</p>
          {estado.conectada && !estado.habilitada && (
            <p className="text-xs text-amber-700 dark:text-amber-400">{t("O envio está pausado.")}</p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor={id("destino")}>{t(txt.destino)}</Label>
          <Input
            id={id("destino")}
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder={txt.exemplo}
            inputMode={plataforma === "pinterest_ads" ? "numeric" : "text"}
          />
          <p className="text-xs text-muted-foreground">{t(txt.ajudaDoDestino)}</p>
        </div>

        {txt.temToken && (
          <div className="flex flex-col gap-2">
            <Label htmlFor={id("token")}>{t("Token de acesso")}</Label>
            <Input
              id={id("token")}
              type="password"
              autoComplete="off"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={
                estado.temToken ? t("Gravado. Deixe em branco para manter.") : t("Cole o token gerado na plataforma")
              }
            />
            {txt.ajudaDoToken && <p className="text-xs text-muted-foreground">{t(txt.ajudaDoToken)}</p>}
            <p className="text-xs text-muted-foreground">
              {t("Guardado criptografado. Ele nunca volta para esta tela depois de salvo.")}
            </p>
          </div>
        )}

        {txt.temTeste && (
          <div className="flex flex-col gap-2">
            <Label htmlFor={id("teste")}>{t("Código de teste (opcional)")}</Label>
            <Input
              id={id("teste")}
              value={codigoDeTeste}
              onChange={(e) => setCodigoDeTeste(e.target.value)}
              placeholder="TEST12345"
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "Enquanto preenchido, as vendas vão marcadas como teste e não contam para a otimização. Apague quando terminar de conferir.",
              )}
            </p>
          </div>
        )}

        <div className="flex items-center justify-between rounded-md border p-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={id("ligado")}>{t("Reportar vendas automaticamente")}</Label>
            <p className="text-xs text-muted-foreground">{t("Desligar pausa o envio e mantém a credencial gravada.")}</p>
          </div>
          <Switch id={id("ligado")} checked={habilitada} onCheckedChange={setHabilitada} />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={isPending || !podeSalvar}>
            {isPending ? t("Salvando…") : t("Salvar conexão")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
