"use client";
/**
 * As variáveis da empresa no painel de ajuda do passo: quem monta o fluxo vê o
 * que existe ({{empresa.endereco}} = "Rua X") e vai para a tela que as edita.
 */
import Link from "next/link";
import { useState } from "react";

import { useT } from "@/hooks/i18n/useT";
import { useVariaveisDaEmpresa } from "@/hooks/inbox/useVariaveisDaEmpresa";
import { PREFIXO_DA_EMPRESA } from "@/lib/empresa/variaveis";
import { ChevronRight } from "lucide-react";

export function VariaveisDaEmpresaNaAjuda() {
  const t = useT();
  const { data } = useVariaveisDaEmpresa();
  const [aberto, setAberto] = useState(false);
  const lista = data ?? [];
  return (
    <div className="rounded-md border border-border" data-testid="chatbot-variaveis-da-empresa">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs font-medium"
        aria-expanded={aberto}
      >
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${aberto ? "rotate-90" : ""}`} />
        {t("Variáveis da empresa")}
      </button>
      {aberto ? (
        <div className="space-y-2 border-t border-border px-3 py-2 text-xs">
          {lista.length === 0 ? (
            <p className="text-muted-foreground">
              {t("Nenhuma ainda. Guarde endereço, Pix ou horário uma vez e use em todos os fluxos.")}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {lista.map((v) => (
                <li key={v.chave} className="wrap-anywhere">
                  <code className="rounded-md bg-muted px-1 py-0.5">{`{{${PREFIXO_DA_EMPRESA}${v.chave}}}`}</code>{" "}
                  <span className="text-muted-foreground">{v.descricao || v.valor.slice(0, 60)}</span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/app/settings/variaveis" className="text-primary underline-offset-2 hover:underline">
            {t("Editar variáveis da empresa")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
