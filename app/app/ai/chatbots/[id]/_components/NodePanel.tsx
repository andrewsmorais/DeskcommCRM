"use client";

/**
 * Painel da direita: configura o passo selecionado. Os campos e os padrões
 * vêm do catálogo (`lib/chatbot/passos.ts`). Texto é aplicado ao sair do campo
 * (um desfazer por edição, não por letra); escolhas são aplicadas na hora.
 */
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { ehTipoDePasso, lerConfig, metaDoPasso } from "@/lib/chatbot/passos";

import { IconeDoPasso } from "./icones";
import type { NodeData } from "./node-types";

export type OpcoesDoPainel = {
  canais: { id: string; nome: string }[];
  atendentes: { id: string; nome: string }[];
};

type Props = {
  tipo: string;
  dados: NodeData;
  opcoes: OpcoesDoPainel;
  onChange: (dados: NodeData) => void;
  onClose: () => void;
  onDelete: () => void;
};

const listaParaTexto = (l: string[]) => l.join(", ");
const textoParaLista = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

const SELECT =
  "h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-hidden focus:border-primary";

/** Campo de texto que só aplica ao sair (ou Enter, se for uma linha). */
function Texto(props: {
  id: string;
  rotulo: string;
  valor: string;
  onCommit: (v: string) => void;
  linhas?: number;
  ajuda?: string;
  placeholder?: string;
}) {
  const [v, setV] = useState(props.valor);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={props.id}>{props.rotulo}</Label>
      {props.linhas ? (
        <Textarea
          id={props.id}
          rows={props.linhas}
          value={v}
          placeholder={props.placeholder}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => v !== props.valor && props.onCommit(v)}
        />
      ) : (
        <Input
          id={props.id}
          value={v}
          placeholder={props.placeholder}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => v !== props.valor && props.onCommit(v)}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
      )}
      {props.ajuda ? <p className="text-xs text-muted-foreground">{props.ajuda}</p> : null}
    </div>
  );
}

export function NodePanel({ tipo, dados, opcoes, onChange, onClose, onDelete }: Props) {
  const t = useT();
  const meta = metaDoPasso(tipo);
  const aplicar = (parcial: Record<string, unknown>) => onChange({ ...dados, ...parcial });

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        {meta ? <IconeDoPasso nome={meta.icone} className={`h-4 w-4 ${meta.cor}`} /> : null}
        <h2 className="text-sm font-semibold">
          {meta ? t(meta.nome) : t("Passo desconhecido — apague-o.")}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-muted-foreground hover:text-foreground"
          aria-label={t("Fechar")}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        {meta ? <p className="text-xs text-muted-foreground">{t(meta.descricao)}</p> : null}
        {ehTipoDePasso(tipo) ? (
          <Campos tipo={tipo} dados={dados} opcoes={opcoes} aplicar={aplicar} />
        ) : null}

        <Button
          type="button"
          variant="outline"
          className="w-full text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t("Apagar passo")}
        </Button>
      </div>
    </div>
  );
}

function Campos({
  tipo,
  dados,
  opcoes,
  aplicar,
}: {
  tipo: string;
  dados: NodeData;
  opcoes: OpcoesDoPainel;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const ajudaVariavel = t(
    'Use {{nome}} para inserir o que o contato respondeu em "Pedir para digitar".',
  );

  switch (tipo) {
    case "inicio_canal": {
      const c = lerConfig("inicio_canal", dados);
      return (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="inicio-canal">{t("Número de WhatsApp")}</Label>
            <select
              id="inicio-canal"
              className={SELECT}
              value={c.channel_session_id ?? ""}
              onChange={(e) => aplicar({ channel_session_id: e.target.value || null })}
            >
              <option value="">{t("Qualquer número da empresa")}</option>
              {opcoes.canais.map((canal) => (
                <option key={canal.id} value={canal.id}>
                  {canal.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("Quando começar")}</Label>
            {(["toda_conversa_nova", "palavra_chave"] as const).map((g) => (
              <label key={g} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="gatilho"
                  checked={c.gatilho === g}
                  onChange={() => aplicar({ gatilho: g })}
                />
                {g === "toda_conversa_nova"
                  ? t("Em toda conversa nova")
                  : t("Só quando a mensagem tiver uma palavra-chave")}
              </label>
            ))}
          </div>
          {c.gatilho === "palavra_chave" ? (
            <Texto
              id="inicio-palavras"
              rotulo={t("Palavras-chave")}
              valor={listaParaTexto(c.palavras)}
              onCommit={(v) => aplicar({ palavras: textoParaLista(v) })}
              ajuda={t("Separe com vírgula. Maiúsculas e acentos não importam.")}
            />
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t("Depois de terminar, o fluxo só recomeça na mesma conversa 6 horas depois.")}
          </p>
        </>
      );
    }
    case "enviar_mensagem": {
      const c = lerConfig("enviar_mensagem", dados);
      return (
        <Texto
          id="msg-texto"
          rotulo={t("Mensagem")}
          valor={c.texto}
          linhas={6}
          onCommit={(v) => aplicar({ texto: v })}
          ajuda={ajudaVariavel}
        />
      );
    }
    case "pedir_escolher":
      return <PedirEscolher dados={dados} aplicar={aplicar} />;
    case "pedir_digitar": {
      const c = lerConfig("pedir_digitar", dados);
      return (
        <>
          <Texto
            id="digitar-pergunta"
            rotulo={t("Pergunta")}
            valor={c.pergunta}
            linhas={3}
            onCommit={(v) => aplicar({ pergunta: v })}
          />
          <Texto
            id="digitar-variavel"
            rotulo={t("Guardar a resposta em")}
            valor={c.variavel}
            onCommit={(v) =>
              aplicar({
                variavel:
                  v
                    .trim()
                    .toLowerCase()
                    .replace(/[^a-z0-9_]/g, "_")
                    .replace(/^[0-9]/, "_$&")
                    .slice(0, 40) || "resposta",
              })
            }
            ajuda={t("Depois use {{nome_que_você_escolheu}} numa mensagem.")}
          />
        </>
      );
    }
    case "mensagem_contem": {
      const c = lerConfig("mensagem_contem", dados);
      return (
        <Texto
          id="contem-palavras"
          rotulo={t("Palavras")}
          valor={listaParaTexto(c.palavras)}
          onCommit={(v) => aplicar({ palavras: textoParaLista(v) })}
          ajuda={t(
            'Separe com vírgula. Se a última mensagem do contato tiver qualquer uma, segue pela saída "Contém".',
          )}
        />
      );
    }
    case "horarios":
      return <Horarios dados={dados} aplicar={aplicar} />;
    case "dias_semana": {
      const c = lerConfig("dias_semana", dados);
      const nomes = [
        t("Domingo"),
        t("Segunda"),
        t("Terça"),
        t("Quarta"),
        t("Quinta"),
        t("Sexta"),
        t("Sábado"),
      ];
      return (
        <div className="space-y-1.5">
          <Label>{t("Dias marcados")}</Label>
          {nomes.map((n, i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={c.dias.includes(i)}
                onChange={(e) =>
                  aplicar({
                    dias: e.target.checked ? [...c.dias, i].sort() : c.dias.filter((d) => d !== i),
                  })
                }
              />
              {n}
            </label>
          ))}
          <p className="text-xs text-muted-foreground">{t("Usa o fuso horário da empresa.")}</p>
        </div>
      );
    }
    case "transferir_equipe": {
      const c = lerConfig("transferir_equipe", dados);
      return (
        <>
          <p className="text-xs text-muted-foreground">
            {t(
              "A conversa vai para a fila de atendentes, e a Distribuição de atendimento escolhe quem pega.",
            )}
          </p>
          <Texto
            id="equipe-msg"
            rotulo={t("Mensagem antes de transferir (opcional)")}
            valor={c.mensagem}
            linhas={3}
            onCommit={(v) => aplicar({ mensagem: v })}
          />
        </>
      );
    }
    case "transferir_atendente": {
      const c = lerConfig("transferir_atendente", dados);
      return (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="atendente">{t("Atendente")}</Label>
            <select
              id="atendente"
              className={SELECT}
              value={c.user_id ?? ""}
              onChange={(e) => aplicar({ user_id: e.target.value || null })}
            >
              <option value="">{t("Escolha um atendente")}</option>
              {opcoes.atendentes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </div>
          <Texto
            id="atendente-msg"
            rotulo={t("Mensagem antes de transferir (opcional)")}
            valor={c.mensagem}
            linhas={3}
            onCommit={(v) => aplicar({ mensagem: v })}
          />
        </>
      );
    }
    case "editar_etiquetas": {
      const c = lerConfig("editar_etiquetas", dados);
      return (
        <>
          <Texto
            id="tags-add"
            rotulo={t("Adicionar etiquetas")}
            valor={listaParaTexto(c.adicionar)}
            onCommit={(v) => aplicar({ adicionar: textoParaLista(v) })}
            ajuda={t("Separe com vírgula.")}
          />
          <Texto
            id="tags-rem"
            rotulo={t("Remover etiquetas")}
            valor={listaParaTexto(c.remover)}
            onCommit={(v) => aplicar({ remover: textoParaLista(v) })}
            ajuda={t("Separe com vírgula.")}
          />
        </>
      );
    }
    case "finalizar_conversa": {
      const c = lerConfig("finalizar_conversa", dados);
      return (
        <Texto
          id="fim-msg"
          rotulo={t("Mensagem de despedida (opcional)")}
          valor={c.mensagem}
          linhas={3}
          onCommit={(v) => aplicar({ mensagem: v })}
        />
      );
    }
    case "bloco_de_notas": {
      const c = lerConfig("bloco_de_notas", dados);
      return (
        <Texto
          id="nota"
          rotulo={t("Anotação")}
          valor={c.texto}
          linhas={8}
          onCommit={(v) => aplicar({ texto: v })}
          ajuda={t("Só aparece aqui no quadro. O contato nunca vê.")}
        />
      );
    }
    default:
      return null;
  }
}

function PedirEscolher({
  dados,
  aplicar,
}: {
  dados: NodeData;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const c = lerConfig("pedir_escolher", dados);
  const [opcoes, setOpcoes] = useState(c.opcoes);
  const gravar = (lista: string[]) => {
    const limpa = lista
      .map((o) => o.trim())
      .filter(Boolean)
      .slice(0, 10);
    if (limpa.length > 0) aplicar({ opcoes: limpa });
  };
  return (
    <>
      <Texto
        id="escolher-pergunta"
        rotulo={t("Pergunta")}
        valor={c.pergunta}
        linhas={3}
        onCommit={(v) => aplicar({ pergunta: v })}
      />
      <div className="space-y-1.5">
        <Label>{t("Opções")}</Label>
        {opcoes.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}.</span>
            <Input
              value={o}
              onChange={(e) => setOpcoes(opcoes.map((x, j) => (j === i ? e.target.value : x)))}
              onBlur={() => gravar(opcoes)}
              aria-label={`${t("Opção")} ${i + 1}`}
            />
            <button
              type="button"
              disabled={opcoes.length <= 1}
              onClick={() => {
                const nova = opcoes.filter((_, j) => j !== i);
                setOpcoes(nova);
                gravar(nova);
              }}
              className="text-muted-foreground hover:text-destructive disabled:opacity-30"
              aria-label={t("Remover opção")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {opcoes.length < 10 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const nova = [...opcoes, `${t("Opção")} ${opcoes.length + 1}`];
              setOpcoes(nova);
              gravar(nova);
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("Adicionar opção")}
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {t(
            "O contato responde com o número ou com o texto da opção. Cada opção tem uma saída no quadro.",
          )}
        </p>
      </div>
      <Texto
        id="escolher-invalida"
        rotulo={t("Se a resposta não for uma opção")}
        valor={c.mensagem_invalida}
        linhas={2}
        onCommit={(v) => aplicar({ mensagem_invalida: v })}
      />
      <div className="space-y-1.5">
        <Label htmlFor="escolher-tentativas">
          {t('Tentativas antes de seguir por "Não respondeu certo"')}
        </Label>
        <select
          id="escolher-tentativas"
          className={SELECT}
          value={c.tentativas}
          onChange={(e) => aplicar({ tentativas: Number(e.target.value) })}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}

function Horarios({
  dados,
  aplicar,
}: {
  dados: NodeData;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const c = lerConfig("horarios", dados);
  return (
    <div className="space-y-1.5">
      <Label>{t("Faixas de horário")}</Label>
      {c.faixas.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            type="time"
            value={f.inicio}
            onChange={(e) =>
              aplicar({
                faixas: c.faixas.map((x, j) => (j === i ? { ...x, inicio: e.target.value } : x)),
              })
            }
            aria-label={t("Início")}
          />
          <span className="text-xs text-muted-foreground">{t("até")}</span>
          <Input
            type="time"
            value={f.fim}
            onChange={(e) =>
              aplicar({
                faixas: c.faixas.map((x, j) => (j === i ? { ...x, fim: e.target.value } : x)),
              })
            }
            aria-label={t("Fim")}
          />
          <button
            type="button"
            disabled={c.faixas.length <= 1}
            onClick={() => aplicar({ faixas: c.faixas.filter((_, j) => j !== i) })}
            className="text-muted-foreground hover:text-destructive disabled:opacity-30"
            aria-label={t("Remover faixa")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {c.faixas.length < 6 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => aplicar({ faixas: [...c.faixas, { inicio: "13:00", fim: "18:00" }] })}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("Adicionar faixa")}
        </Button>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t("Usa o fuso horário da empresa. Uma faixa como 22:00 até 06:00 passa da meia-noite.")}
      </p>
    </div>
  );
}
