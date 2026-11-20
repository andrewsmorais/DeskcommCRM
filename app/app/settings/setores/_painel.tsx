"use client";

/**
 * O painel da tela de Setores: a lista, com os membros de cada setor, e o
 * formulário de criar/editar. Excluir pede confirmação na própria linha (sem
 * janela do navegador) e diz o que acontece com as conversas: elas ficam, só
 * perdem a marca do setor (`on delete set null`, migration 0496).
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { SetorComMembros } from "@/lib/setores/servico";

type Pessoa = { id: string; nome: string };
type Dia = { aberto: boolean; inicio: string; fim: string };
type Rascunho = {
  id: string | null;
  nome: string;
  descricao: string;
  membros: string[];
  /** Horário do setor (migration 0545): desligado = atende a qualquer hora. */
  comHorario: boolean;
  fuso: string | null;
  dias: Dia[];
};

/** Domingo = 0, como `getDay` e como a jornada do atendente. */
const DIAS_DA_SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;

function diasPadrao(): Dia[] {
  return Array.from({ length: 7 }, (_, dow) => ({
    aberto: dow >= 1 && dow <= 5,
    inicio: "08:00",
    fim: "18:00",
  }));
}

/** O horário gravado vira o rascunho da tela: um intervalo por dia (o primeiro). */
function diasDoHorario(horario: SetorComMembros["horario"]): Dia[] {
  const dias = diasPadrao().map((d) => ({ ...d, aberto: false }));
  for (const w of horario?.windows ?? []) {
    const d = dias[w.dow];
    if (d && !d.aberto) dias[w.dow] = { aberto: true, inicio: w.start, fim: w.end };
  }
  return dias;
}

const VAZIO: Rascunho = {
  id: null,
  nome: "",
  descricao: "",
  membros: [],
  comHorario: false,
  fuso: null,
  dias: diasPadrao(),
};

export function PainelDeSetores({
  setores,
  atendentes,
}: {
  setores: SetorComMembros[];
  atendentes: Pessoa[];
}) {
  const t = useT();
  const { activeOrg } = useAuth();
  const nomeDoDia: Record<number, string> = {
    0: t("Dom"),
    1: t("Seg"),
    2: t("Ter"),
    3: t("Qua"),
    4: t("Qui"),
    5: t("Sex"),
    6: t("Sáb"),
  };
  const router = useRouter();
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const nomeDe = new Map(atendentes.map((p) => [p.id, p.nome]));

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!rascunho) return;
    const fuso = rascunho.fuso ?? activeOrg?.timezone ?? "America/Sao_Paulo";
    const janelas = rascunho.comHorario
      ? rascunho.dias.flatMap((d, dow) =>
          d.aberto && d.inicio < d.fim ? [{ dow, start: d.inicio, end: d.fim }] : [],
        )
      : [];
    if (rascunho.comHorario && janelas.length === 0) {
      toast.error(t("Marque pelo menos um dia, com o início antes do fim."));
      return;
    }
    const corpo = {
      nome: rascunho.nome,
      descricao: rascunho.descricao.trim() ? rascunho.descricao : null,
      membros: rascunho.membros,
      horario: { timezone: fuso, windows: janelas },
    };
    startTransition(async () => {
      try {
        if (rascunho.id) await apiClient.patch(`/api/v1/setores/${rascunho.id}`, corpo);
        else await apiClient.post("/api/v1/setores", corpo);
        toast.success(t("Setor salvo."));
        setRascunho(null);
        router.refresh();
      } catch (err) {
        // A mensagem do servidor já vem no idioma de quem pediu.
        toast.error(err instanceof Error && err.message ? err.message : t("Não consegui salvar."));
      }
    });
  }

  function apagar(id: string) {
    startTransition(async () => {
      try {
        await apiClient.delete(`/api/v1/setores/${id}`);
        toast.success(t("Setor excluído."));
        setApagando(null);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error && err.message ? err.message : t("Não consegui excluir."));
      }
    });
  }

  function alternarMembro(id: string) {
    setRascunho((r) =>
      r
        ? {
            ...r,
            membros: r.membros.includes(id)
              ? r.membros.filter((m) => m !== id)
              : [...r.membros, id],
          }
        : r,
    );
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4" data-testid="painel-setores">
      {rascunho ? (
        <Card className="space-y-4 p-4">
          <form onSubmit={salvar} className="space-y-4" data-testid="form-setor">
            <h2 className="text-sm font-semibold">
              {rascunho.id ? t("Editar setor") : t("Novo setor")}
            </h2>
            <div className="space-y-1">
              <Label htmlFor="setor-nome">{t("Nome")}</Label>
              <Input
                id="setor-nome"
                value={rascunho.nome}
                maxLength={60}
                required
                placeholder={t("Ex.: Vendas")}
                onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="setor-descricao">{t("Descrição (opcional)")}</Label>
              <Textarea
                id="setor-descricao"
                value={rascunho.descricao}
                maxLength={300}
                rows={2}
                onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
              />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t("Quem atende neste setor")}</legend>
              {atendentes.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {t("Ninguém na equipe ainda. Convide pessoas em Equipe.")}
                </p>
              ) : (
                <div className="grid gap-1 sm:grid-cols-2">
                  {atendentes.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-primary"
                        checked={rascunho.membros.includes(p.id)}
                        onChange={() => alternarMembro(p.id)}
                      />
                      {p.nome}
                    </label>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t(
                  "Setor sem ninguém não recebe conversa: ela fica na fila até alguém do setor ser incluído.",
                )}
              </p>
            </fieldset>
            <fieldset className="space-y-2" data-testid="horario-do-setor">
              <legend className="text-sm font-medium">{t("Horário do setor")}</legend>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={rascunho.comHorario}
                  onChange={(e) => setRascunho({ ...rascunho, comHorario: e.target.checked })}
                  data-testid="setor-com-horario"
                />
                {t("Este setor só atende em alguns horários")}
              </label>
              {rascunho.comHorario ? (
                <div className="space-y-1">
                  {DIAS_DA_SEMANA.map((dow) => {
                    const d = rascunho.dias[dow]!;
                    const mudar = (novo: Partial<Dia>) =>
                      setRascunho({
                        ...rascunho,
                        dias: rascunho.dias.map((x, i) => (i === dow ? { ...x, ...novo } : x)),
                      });
                    return (
                      <div key={dow} className="flex flex-wrap items-center gap-2 text-sm">
                        <label className="flex w-20 items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary"
                            checked={d.aberto}
                            onChange={(e) => mudar({ aberto: e.target.checked })}
                          />
                          {nomeDoDia[dow]}
                        </label>
                        <Input
                          type="time"
                          className="h-8 w-28"
                          value={d.inicio}
                          disabled={!d.aberto}
                          aria-label={`${nomeDoDia[dow]} — ${t("início")}`}
                          onChange={(e) => mudar({ inicio: e.target.value })}
                        />
                        <span className="text-muted-foreground">{t("até")}</span>
                        <Input
                          type="time"
                          className="h-8 w-28"
                          value={d.fim}
                          disabled={!d.aberto}
                          aria-label={`${nomeDoDia[dow]} — ${t("fim")}`}
                          onChange={(e) => mudar({ fim: e.target.value })}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {t(
                  "Fora do horário, a conversa deste setor não é entregue a ninguém: ela espera na Fila e é entregue quando o setor abre.",
                )}
              </p>
            </fieldset>
            <div className="flex gap-2">
              <Button type="submit" disabled={isPending || !rascunho.nome.trim()}>
                {t("Salvar")}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setRascunho(null)}>
                {t("Cancelar")}
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <div>
          <Button onClick={() => setRascunho(VAZIO)} data-testid="novo-setor">
            {t("Novo setor")}
          </Button>
        </div>
      )}

      {setores.length === 0 ? (
        <Card className="p-4 text-sm text-muted-foreground">
          {t("Nenhum setor ainda. Sem setores, toda conversa vai para a equipe toda, como sempre.")}
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {setores.map((s) => (
            <li key={s.id}>
              <Card className="flex flex-col gap-2 p-4" data-testid="linha-setor">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-medium">{s.nome}</p>
                    {s.descricao ? (
                      <p className="text-xs text-muted-foreground">{s.descricao}</p>
                    ) : null}
                    {(s.horario?.windows.length ?? 0) > 0 ? (
                      <p className="text-xs text-muted-foreground" data-testid="resumo-horario-do-setor">
                        {t("Atende:")}{" "}
                        {DIAS_DA_SEMANA.flatMap((dow) => {
                          const w = s.horario?.windows.find((x) => x.dow === dow);
                          return w ? [`${nomeDoDia[dow]} ${w.start}–${w.end}`] : [];
                        }).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setRascunho({
                          id: s.id,
                          nome: s.nome,
                          descricao: s.descricao ?? "",
                          membros: s.membros,
                          comHorario: (s.horario?.windows.length ?? 0) > 0,
                          fuso: s.horario?.timezone ?? null,
                          dias:
                            (s.horario?.windows.length ?? 0) > 0
                              ? diasDoHorario(s.horario)
                              : diasPadrao(),
                        })
                      }
                    >
                      {t("Editar")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setApagando(s.id)}>
                      {t("Excluir")}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.membros.length === 0
                    ? t("Ninguém neste setor ainda.")
                    : s.membros.map((m) => nomeDe.get(m) ?? m.slice(0, 8)).join(", ")}
                </p>
                {apagando === s.id ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs">
                    <span>
                      {t(
                        "Excluir o setor? As conversas dele continuam na Inbox, só sem a marca do setor.",
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => apagar(s.id)}
                    >
                      {t("Excluir setor")}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setApagando(null)}>
                      {t("Cancelar")}
                    </Button>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
