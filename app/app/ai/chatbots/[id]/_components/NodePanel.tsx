"use client";

/**
 * Painel da direita: configura o passo selecionado. Os campos e os padrões
 * vêm do catálogo (`lib/chatbot/passos.ts`). Texto é aplicado ao sair do campo
 * (um desfazer por edição, não por letra); escolhas são aplicadas na hora.
 */
import { useEffect, useRef, useState } from "react";
import { FileText, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import {
  ehTipoDePasso,
  lerConfig,
  FORMATOS_DE_RESPOSTA,
  metaDoPasso,
  PRAZOS_DE_RESPOSTA,
  MODOS_DE_ATENDENTE,
  perguntaDoFormularioSchema,
  problemaDaConfig,
  regraSchema,
  type ConfigDe,
  type FormatoDeResposta,
  type ModoDeAtendente,
  type PerguntaDoFormulario,
  type Regra,
} from "@/lib/chatbot/passos";

import { MENSAGEM_FORA_DO_FORMATO, MENSAGEM_NENHUMA_OPCAO } from "@/lib/chatbot/motor";
import type { MidiaDaBiblioteca } from "@/lib/chatbot/biblioteca-de-midias";
import { lerDatasDeFeriado } from "@/lib/chatbot/feriados";
import { linksDoTexto, type ProblemaDoLink } from "@/lib/chatbot/links";
import { cabecalhoReservado, corpoPersonalizadoValido } from "@/lib/chatbot/webhook-corpo";
import { IconeDoPasso } from "./icones";
import { RespostasAceitas } from "./RespostasAceitas";
import { EstatisticaDoBloco } from "./EstatisticaDoBloco";
import type { NodeData } from "./node-types";

export type OpcoesDoPainel = {
  canais: { id: string; nome: string }[];
  atendentes: { id: string; nome: string }[];
  /** Follow-ups publicados (os roteiros de atendimento ficam de fora). */
  /**
   * Todos os follow-ups da empresa. Só o publicado roda; rascunho e desligado
   * aparecem apagados. Roteiro de atendimento não entra pelo chatbot: quem o
   * conduz é o agente de IA, no turno dele.
   */
  followups: {
    id: string;
    nome: string;
    situacao: "publicado" | "rascunho" | "desligado";
    roteiro: boolean;
  }[];
  /** O fluxo aberto no editor (para subir arquivo e para "Acionar outro fluxo"). */
  fluxoAtual: string;
  fluxos: { id: string; nome: string; ligado: boolean }[];
  /** Tipos de atendimento da Agenda. */
  tiposDeAtendimento: { id: string; nome: string; ativo: boolean }[];
  funis: { id: string; nome: string; etapas: { id: string; nome: string }[] }[];
  /** Setores de atendimento (Configurações › Setores). */
  setores: { id: string; nome: string }[];
  /** Modelos aprovados pela Meta que um fluxo consegue mandar sozinho (sem variáveis). */
  modelos: { id: string; nome: string; idioma: string; texto: string }[];
  /** Arquivos que os "Enviar mídia" dos fluxos da empresa já usam (biblioteca). */
  midias: MidiaDaBiblioteca[];
  /** Produtos do Catálogo ("Enviar produto"). */
  produtos: { id: string; nome: string; ativo: boolean }[];
  /** Agentes de IA da empresa ("Transferir p/ agentes de IA"); só o publicado atende. */
  agentes?: { id: string; nome: string; publicado: boolean }[];
};

type Props = {
  /** O id do bloco no desenho (para a estatística dele). */
  noId?: string;
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

/** Nome de variável ou de campo personalizado: minúsculas, números e _. */
const comoChave = (v: string) =>
  v
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^[0-9]/, "_$&")
    .slice(0, 40);

const SELECT =
  "h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-hidden focus:border-primary";

/** Campo de texto que só aplica ao sair (ou Enter, se for uma linha). */
/** "Iniciar manualmente": não listado e perguntas ao atendente (paridade Umbler). */
function InicioManual({ dados, aplicar }: { dados: NodeData; aplicar: (p: Record<string, unknown>) => void }) {
  const t = useT();
  const c = lerConfig("inicio_manual", dados);
  const mudar = (i: number, parte: Partial<(typeof c.perguntas)[number]>) =>
    aplicar({ perguntas: c.perguntas.map((p, j) => (j === i ? { ...p, ...parte } : p)) });
  return (
    <>
      <div className="space-y-2 text-xs text-muted-foreground">
        <p>
          {t(
            "Este fluxo começa quando um atendente aciona na conversa: na Inbox, o botão do robô no topo da conversa lista os chatbots ligados com este início.",
          )}
        </p>
        <p>
          {t(
            "Bom para pesquisa de satisfação no fim do atendimento, menu de pagamento ou coleta de dados. O chatbot responde até o fluxo terminar, mesmo com a conversa no nome do atendente.",
          )}
        </p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={c.nao_listado}
          onChange={(e) => aplicar({ nao_listado: e.target.checked })}
          data-testid="nao-listado"
        />
        <span>
          {t("Não listado")}
          <span className="block text-xs text-muted-foreground">
            {t("Não aparece no botão do robô da conversa. Continua valendo no Fechar, no Agendar e nas automações.")}
          </span>
        </span>
      </label>
      <div className="space-y-2">
        <Label>{t("Perguntar ao atendente ao iniciar")}</Label>
        {c.perguntas.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              aria-label={t("Pergunta ao atendente")}
              value={p.rotulo}
              maxLength={80}
              onChange={(e) => mudar(i, { rotulo: e.target.value })}
            />
            <Input
              aria-label={t("Guardar em")}
              className="w-36 font-mono"
              value={p.variavel}
              maxLength={40}
              onChange={(e) =>
                mudar(i, {
                  variavel: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[0-9]/, "_$&"),
                })
              }
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={t("Remover pergunta")}
              onClick={() => aplicar({ perguntas: c.perguntas.filter((_, j) => j !== i) })}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {c.perguntas.length < 5 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              aplicar({
                perguntas: [
                  ...c.perguntas,
                  { rotulo: t("Número do pedido"), variavel: `pergunta_${c.perguntas.length + 1}` },
                ],
              })
            }
          >
            <Plus className="size-4" /> {t("Adicionar pergunta")}
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {t("Na hora de iniciar, o atendente responde; cada resposta vira uma variável do fluxo, como {{numero_do_pedido}}.")}
        </p>
      </div>
    </>
  );
}

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

/**
 * Config gravada fora do formato (um texto acima do limite, uma lista longa
 * demais): o motor apara o excesso, e o fluxo não liga enquanto não for
 * corrigida. Antes o passo voltava inteiro ao padrão sem aviso nenhum.
 */
function AvisoDeConfig({ tipo, dados }: { tipo: string; dados: NodeData }) {
  const t = useT();
  if (!ehTipoDePasso(tipo)) return null;
  const problema = problemaDaConfig(tipo, dados);
  if (!problema) return null;
  return (
    <p
      className="rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
      data-testid="config-fora-do-limite"
    >
      {problema.limite !== null
        ? `${t("Um campo passou do limite")} (“${problema.campo}”, ${t("máximo")} ${problema.limite}). ${t("Encurte para o fluxo poder ser ligado.")}`
        : `${t("Um campo está num formato que o passo não aceita")} (“${problema.campo}”). ${t("Corrija para o fluxo poder ser ligado.")}`}
    </p>
  );
}

export function NodePanel({ noId, tipo, dados, opcoes, onChange, onClose, onDelete }: Props) {
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
        <AvisoDeConfig tipo={tipo} dados={dados} />
        {noId && opcoes.fluxoAtual ? (
          <EstatisticaDoBloco fluxoId={opcoes.fluxoAtual} noId={noId} tipo={tipo} dados={dados} />
        ) : null}
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
    case "inicio_automacao":
      return (
        <div className="space-y-2 text-xs text-muted-foreground">
          <p>
            {t(
              "Este fluxo não responde a mensagens: ele começa quando uma automação manda, e pode ficar ligado junto com o fluxo de atendimento.",
            )}
          </p>
          <p>
            {t(
              'Para usar: em Automações, crie uma regra (ex.: "Quando um lead mudar de etapa", para a etapa "Pago") com a ação "Iniciar chatbot" e escolha este fluxo.',
            )}
          </p>
          <p>
            {t(
              "As informações do negócio chegam como variáveis: {{produto}}, {{link_checkout}}, {{valor}}, {{evento_da_venda}} e os outros campos do negócio.",
            )}
          </p>
        </div>
      );
    case "inicio_manual":
      return <InicioManual dados={dados} aplicar={aplicar} />;
    case "distribuir_fluxo":
      return <DistribuirFluxo dados={dados} aplicar={aplicar} />;
    case "contato_ativo": {
      const c = lerConfig("contato_ativo", dados);
      return (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="ativo-horas">{t("Mensagem do contato nas últimas (horas)")}</Label>
            <select
              id="ativo-horas"
              className={SELECT}
              value={c.horas}
              onChange={(e) => aplicar({ horas: Number(e.target.value) })}
            >
              {[1, 6, 12, 24, 48, 72, 168].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              'Ativo = o contato mandou mensagem dentro desse tempo. 24 horas é a janela do WhatsApp: fora dela, escrever primeiro tem mais risco de bloqueio.',
            )}
          </p>
        </>
      );
    }
    case "tem_etiqueta": {
      const c = lerConfig("tem_etiqueta", dados);
      return (
        <>
          <Texto
            id="etq-lista"
            rotulo={t("Etiquetas")}
            valor={listaParaTexto(c.etiquetas)}
            onCommit={(v) => aplicar({ etiquetas: textoParaLista(v) })}
            ajuda={t("Separe com vírgula. Maiúsculas e acentos não importam.")}
          />
          <div className="space-y-1.5">
            <Label>{t("Segue por \"Tem\" quando o contato tem")}</Label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="etq-modo"
                checked={c.modo === "alguma"}
                onChange={() => aplicar({ modo: "alguma" })}
              />
              {t("Qualquer uma delas")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="etq-modo"
                checked={c.modo === "todas"}
                onChange={() => aplicar({ modo: "todas" })}
              />
              {t("Todas elas")}
            </label>
          </div>
        </>
      );
    }
    case "primeira_conversa":
      return (
        <p className="text-xs text-muted-foreground">
          {t(
            'Segue por "Primeira vez" quando o contato nunca tinha mandado mensagem antes deste atendimento. Bom para dar boas-vindas a quem chega e um "que bom te ver de novo" a quem volta.',
          )}
        </p>
      );
    case "canal_da_conversa": {
      const c = lerConfig("canal_da_conversa", dados);
      return (
        <div className="space-y-1.5">
          <Label>{t("Números de WhatsApp")}</Label>
          {opcoes.canais.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("Nenhum número conectado ainda.")}</p>
          ) : (
            opcoes.canais.map((canal) => (
              <label key={canal.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={c.canais.includes(canal.id)}
                  onChange={(e) =>
                    aplicar({
                      canais: e.target.checked ? [...c.canais, canal.id] : c.canais.filter((x) => x !== canal.id),
                    })
                  }
                />
                {canal.nome}
              </label>
            ))
          )}
          <p className="text-xs text-muted-foreground">
            {t('Se a conversa for por um dos números marcados, segue por "Um dos números".')}
          </p>
        </div>
      );
    }
    case "setor_da_conversa": {
      const c = lerConfig("setor_da_conversa", dados);
      return (
        <div className="space-y-1.5">
          <Label>{t("Setores")}</Label>
          {opcoes.setores.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("Nenhum setor ainda. Crie os setores em Configurações › Setores.")}
            </p>
          ) : (
            opcoes.setores.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={c.setores.includes(s.id)}
                  onChange={(e) =>
                    aplicar({
                      setores: e.target.checked
                        ? [...c.setores, s.id]
                        : c.setores.filter((x) => x !== s.id),
                    })
                  }
                />
                {s.nome}
              </label>
            ))
          )}
          <p className="text-xs text-muted-foreground">
            {t('Se a conversa estiver num dos setores marcados, segue por "Um dos setores".')}
          </p>
        </div>
      );
    }
    case "atendente_da_conversa": {
      const c = lerConfig("atendente_da_conversa", dados);
      return (
        <div className="space-y-1.5">
          <Label>{t("Atendentes")}</Label>
          {opcoes.atendentes.map((a) => (
            <label key={a.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={c.atendentes.includes(a.id)}
                onChange={(e) =>
                  aplicar({
                    atendentes: e.target.checked ? [...c.atendentes, a.id] : c.atendentes.filter((x) => x !== a.id),
                  })
                }
              />
              {a.nome}
            </label>
          ))}
          <p className="text-xs text-muted-foreground">
            {t(
              'Segue por "É um deles" quando a conversa está com um dos marcados. Sem ninguém marcado: quando a conversa está com qualquer atendente.',
            )}
          </p>
        </div>
      );
    }
    case "presenca_do_atendente":
      return (
        <p className="text-xs text-muted-foreground">
          {t(
            'Segue por "Alguém disponível" quando há atendente marcado como disponível, com vaga e dentro do horário de trabalho — a mesma regra da Distribuição de atendimento. Use antes de transferir: sem ninguém, avise o horário de atendimento.',
          )}
        </p>
      );
    case "bot_paralelo":
      return (
        <p className="text-xs text-muted-foreground">
          {t(
            'Segue por "Tem outro bot" quando o agente de IA está atendendo esta conversa ou outro chatbot está esperando resposta nela.',
          )}
        </p>
      );
    case "status_da_conversa":
      return (
        <p className="text-xs text-muted-foreground">
          {t(
            'Segue por "Esperando resposta" quando a última mensagem da conversa é do contato. Útil depois de um "Aguardar": se ninguém respondeu, o chatbot avisa ou transfere.',
          )}
        </p>
      );
    case "bloquear_contato": {
      const c = lerConfig("bloquear_contato", dados);
      return (
        <>
          <Texto
            id="bloquear-msg"
            rotulo={t("Mensagem antes de bloquear (opcional)")}
            valor={c.mensagem}
            linhas={3}
            onCommit={(v) => aplicar({ mensagem: v })}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "O contato fica bloqueado como quem pediu para sair: nem chatbot, nem agente de IA, nem campanha escrevem mais para ele. A conversa é finalizada. Para desbloquear, abra a ficha do contato.",
            )}
          </p>
        </>
      );
    }
    case "excluir_contato": {
      const c = lerConfig("excluir_contato", dados);
      return (
        <>
          <Texto
            id="excluir-msg"
            rotulo={t("Mensagem ao contato")}
            valor={c.mensagem}
            linhas={3}
            onCommit={(v) => aplicar({ mensagem: v })}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "Pela LGPD, o chatbot não apaga nada sozinho: ele abre o pedido de exclusão dos dados, avisa a equipe na Central e deixa uma nota na conversa. Um admin aprova em Configurações › LGPD, e os dados são anonimizados em até 15 dias úteis.",
            )}
          </p>
        </>
      );
    }
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
              onCommit={(v) => aplicar({ palavras: textoParaLista(v).slice(0, 20) })}
              ajuda={t("Separe com vírgula, até 20 palavras. Maiúsculas e acentos não importam.")}
            />
          ) : null}
          <OrigensDoInicio origens={c.origens} aplicar={aplicar} />
          <p className="text-xs text-muted-foreground">
            {t(
              "O fluxo roda uma vez por atendimento. Depois de entregar a conversa (à equipe, a um atendente ou à IA), só volta quando o atendimento for finalizado e o contato escrever de novo. Sem entrega, recomeça na mesma conversa 6 horas depois. Palavra-chave recomeça na hora.",
            )}
          </p>
        </>
      );
    }
    case "enviar_mensagem": {
      const c = lerConfig("enviar_mensagem", dados);
      return (
        <>
          <Texto
            id="msg-texto"
            rotulo={t("Mensagem")}
            valor={c.texto}
            linhas={6}
            onCommit={(v) => aplicar({ texto: v })}
            ajuda={ajudaVariavel}
          />
          <AvisosDeLink texto={c.texto} />
          <div className="space-y-1.5 rounded-md border border-border p-3">
            <Label>{t("Botão de link (opcional)")}</Label>
            <Texto
              id="msg-botao-texto"
              rotulo={t("Texto do botão")}
              valor={c.botao_texto}
              placeholder={t("Ver o pedido")}
              onCommit={(v) => aplicar({ botao_texto: v.slice(0, 40) })}
            />
            <Texto
              id="msg-botao-url"
              rotulo={t("Endereço")}
              valor={c.botao_url}
              placeholder="https://"
              onCommit={(v) => aplicar({ botao_url: v })}
            />
            <p className="text-xs text-muted-foreground">
              {t("No WhatsApp por QR code não existe botão: vai como texto embaixo da mensagem, assim: Texto do botão: endereço.")}
            </p>
          </div>
        </>
      );
    }
    case "guardar_valor": {
      const c = lerConfig("guardar_valor", dados);
      return (
        <>
          <Texto
            id="guardar-variavel"
            rotulo={t("Nome da variável")}
            valor={c.variavel}
            placeholder="origem"
            onCommit={(v) => {
              const limpo = v.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[^a-z]+/, "");
              if (limpo) aplicar({ variavel: limpo.slice(0, 40) });
            }}
            ajuda={t("Letras minúsculas, números e _. Depois, use como {{nome}} numa mensagem, no Valor ou no WebHook.")}
          />
          <Texto
            id="guardar-valor"
            rotulo={t("Valor")}
            valor={c.valor}
            linhas={2}
            placeholder={t("Ex.: instagram, ou {{nome}} {{sobrenome}}")}
            onCommit={(v) => aplicar({ valor: v })}
            ajuda={t("Aceita {{variavel}}. Se a variável já existir, o valor novo toma o lugar do antigo.")}
          />
        </>
      );
    }
    case "enviar_oferta": {
      const c = lerConfig("enviar_oferta", dados);
      return (
        <>
          <Texto
            id="oferta-texto"
            rotulo={t("Mensagem da oferta")}
            valor={c.texto}
            linhas={5}
            placeholder={t("Ex.: 20% de desconto no plano anual: {{link}}")}
            onCommit={(v) => aplicar({ texto: v })}
            ajuda={t(
              "Escreva {{validade}} onde quiser mostrar a data. Sem isso, o chatbot acrescenta a linha “Válida até” no fim.",
            )}
          />
          <AvisosDeLink texto={c.texto} />
          <div className="space-y-1.5">
            <Label htmlFor="oferta-validade">{t("Válida até (inclusive)")}</Label>
            <Input
              id="oferta-validade"
              type="date"
              value={c.valida_ate}
              onChange={(e) => aplicar({ valida_ate: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "Depois desse dia, no fuso da empresa, o contato não recebe a oferta e o fluxo segue por “Oferta vencida”. Sem data, ela não vence.",
              )}
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={c.mostrar_validade}
              onChange={(e) => aplicar({ mostrar_validade: e.target.checked })}
            />
            <span>{t("Mostrar a data de validade na mensagem")}</span>
          </label>
        </>
      );
    }
    case "enviar_pagamento": {
      const c = lerConfig("enviar_pagamento", dados);
      return (
        <>
          <Texto
            id="pagamento-descricao"
            rotulo={t("O que está sendo cobrado")}
            valor={c.descricao}
            placeholder={t("Ex.: Consulta de avaliação")}
            onCommit={(v) => aplicar({ descricao: v })}
          />
          <Texto
            id="pagamento-valor"
            rotulo={t("Valor (opcional)")}
            valor={c.valor}
            placeholder="R$ 99,90"
            onCommit={(v) => aplicar({ valor: v })}
          />
          <Texto
            id="pagamento-link"
            rotulo={t("Link de pagamento")}
            valor={c.link}
            placeholder="https://"
            onCommit={(v) => aplicar({ link: v })}
            ajuda={t(
              "O link do Mercado Pago, Asaas, PagSeguro ou da sua loja. Aceita {{variavel}}, como o {{link_checkout}} de uma automação de venda.",
            )}
          />
          <Texto
            id="pagamento-pix"
            rotulo={t("Pix copia e cola (opcional)")}
            valor={c.pix}
            linhas={3}
            onCommit={(v) => aplicar({ pix: v })}
            ajuda={t("Vai numa mensagem separada, para o contato copiar inteiro.")}
          />
          <Texto
            id="pagamento-mensagem"
            rotulo={t("Mensagem antes do link (opcional)")}
            valor={c.mensagem}
            linhas={3}
            onCommit={(v) => aplicar({ mensagem: v })}
            ajuda={ajudaVariavel}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              'O chatbot envia o link, mas não confere se foi pago. Se o link ficar vazio (uma variável sem valor), o fluxo segue por "Sem link".',
            )}
          </p>
        </>
      );
    }
    case "enviar_localizacao": {
      const c = lerConfig("enviar_localizacao", dados);
      const numero = (v: string) => {
        const n = Number(v.replace(",", "."));
        return v.trim() && Number.isFinite(n) ? n : null;
      };
      return (
        <>
          <Texto
            id="local-nome"
            rotulo={t("Nome do lugar (opcional)")}
            valor={c.nome}
            onCommit={(v) => aplicar({ nome: v })}
          />
          <Texto
            id="local-endereco"
            rotulo={t("Endereço")}
            valor={c.endereco}
            linhas={2}
            onCommit={(v) => aplicar({ endereco: v })}
          />
          <div className="grid grid-cols-2 gap-2">
            <Texto
              id="local-lat"
              rotulo={t("Latitude (opcional)")}
              valor={c.latitude === null ? "" : String(c.latitude)}
              placeholder="-23.5505"
              onCommit={(v) => aplicar({ latitude: numero(v) })}
            />
            <Texto
              id="local-lng"
              rotulo={t("Longitude (opcional)")}
              valor={c.longitude === null ? "" : String(c.longitude)}
              placeholder="-46.6333"
              onCommit={(v) => aplicar({ longitude: numero(v) })}
            />
          </div>
          <Texto
            id="local-mensagem"
            rotulo={t("Mensagem antes (opcional)")}
            valor={c.mensagem}
            linhas={2}
            onCommit={(v) => aplicar({ mensagem: v })}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "Sai como mensagem com o endereço e o link do mapa, que abre no celular. Com latitude e longitude, o mapa cai no ponto exato.",
            )}
          </p>
        </>
      );
    }
    case "enviar_contato": {
      const c = lerConfig("enviar_contato", dados);
      return (
        <>
          <Texto
            id="contato-nome"
            rotulo={t("Nome")}
            valor={c.nome}
            onCommit={(v) => aplicar({ nome: v })}
          />
          <Texto
            id="contato-telefone"
            rotulo={t("Telefone com DDD")}
            valor={c.telefone}
            placeholder="(11) 98765-4321"
            onCommit={(v) => aplicar({ telefone: v })}
          />
          <p className="text-xs text-muted-foreground">
            {t("O cliente recebe um cartão de contato e salva com um toque.")}
          </p>
        </>
      );
    }
    case "enviar_produto": {
      const c = lerConfig("enviar_produto", dados);
      return (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="produto">{t("Produto do Catálogo")}</Label>
            <select
              id="produto"
              className={SELECT}
              value={c.produto_id ?? ""}
              onChange={(e) => {
                const p = opcoes.produtos.find((x) => x.id === e.target.value);
                aplicar({ produto_id: p?.id ?? null, nome_do_produto: p?.nome ?? "" });
              }}
            >
              <option value="">{t("Escolha um produto")}</option>
              {opcoes.produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.ativo ? p.nome : `${p.nome} (${t("desativado")})`}
                </option>
              ))}
            </select>
            {opcoes.produtos.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t("Nenhum produto ainda. Cadastre em Catálogo.")}
              </p>
            ) : null}
          </div>
          <Texto
            id="produto-mensagem"
            rotulo={t("Mensagem antes (opcional)")}
            valor={c.mensagem}
            linhas={2}
            onCommit={(v) => aplicar({ mensagem: v })}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "Na hora do envio, o chatbot lê o produto no Catálogo: sai a primeira foto com nome, preço e descrição atuais. Produto desativado não sai e fica uma nota para a equipe.",
            )}
          </p>
        </>
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
          <RespostasAceitas opcoes={c.opcoes} onChange={(opcoes) => aplicar({ opcoes })} />
          {c.opcoes.length > 0 ? null : (
          <div className="space-y-1.5">
            <Label htmlFor="digitar-formato">{t("O que a resposta precisa ser")}</Label>
            <select
              id="digitar-formato"
              className={SELECT}
              value={c.formato}
              onChange={(e) => aplicar({ formato: e.target.value as FormatoDeResposta })}
            >
              {FORMATOS_DE_RESPOSTA.map((f) => (
                <option key={f} value={f}>
                  {t(NOMES_DO_FORMATO_DE_RESPOSTA[f])}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {c.formato === "qualquer"
                ? t("Qualquer resposta serve, até áudio ou foto.")
                : t(
                    'Se a resposta não estiver no formato, o chatbot pede de novo. Depois das tentativas, segue por "Não respondeu certo".',
                  )}
            </p>
          </div>
          )}
          {c.formato !== "qualquer" || c.opcoes.length > 0 ? (
            <>
              <Texto
                id="digitar-invalida"
                rotulo={
                  c.opcoes.length > 0 ? t("Se nenhuma opção bater") : t("Se a resposta não estiver no formato")
                }
                valor={c.mensagem_invalida}
                linhas={2}
                placeholder={c.opcoes.length > 0 ? MENSAGEM_NENHUMA_OPCAO : MENSAGEM_FORA_DO_FORMATO[c.formato]}
                onCommit={(v) => aplicar({ mensagem_invalida: v })}
              />
              <div className="space-y-1.5">
                <Label htmlFor="digitar-tentativas">
                  {c.opcoes.length > 0
                    ? t('Tentativas antes de seguir por "Nenhuma opção"')
                    : t('Tentativas antes de seguir por "Não respondeu certo"')}
                </Label>
                <select
                  id="digitar-tentativas"
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
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={c.usar_mensagem_anterior}
              onChange={(e) => aplicar({ usar_mensagem_anterior: e.target.checked })}
            />
            <span>
              {t("Usar a mensagem anterior")}
              <span className="block text-xs text-muted-foreground">
                {t(
                  "Sem fazer a pergunta, usa a mensagem que o contato acabou de mandar, se ela estiver no formato. Se não estiver, o chatbot faz a pergunta.",
                )}
              </span>
            </span>
          </label>
          <PrazoDaResposta id="digitar-prazo" valor={c.prazo_minutos} aplicar={aplicar} />
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
          <div className="space-y-1.5">
            <Label htmlFor="equipe-setor">{t("Para quem")}</Label>
            <select
              id="equipe-setor"
              className={SELECT}
              value={c.setor_da_conversa ? "__da_conversa" : (c.setor_id ?? "")}
              onChange={(e) => {
                if (e.target.value === "__da_conversa") {
                  aplicar({ setor_da_conversa: true, setor_id: null, nome_do_setor: "" });
                  return;
                }
                const s = opcoes.setores.find((x) => x.id === e.target.value);
                aplicar({ setor_da_conversa: false, setor_id: s?.id ?? null, nome_do_setor: s?.nome ?? "" });
              }}
            >
              <option value="">{t("Equipe toda")}</option>
              <option value="__da_conversa">{t("O setor em que a conversa já estava")}</option>
              {opcoes.setores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            {c.setor_da_conversa
              ? t("A conversa volta para o setor do atendimento anterior. Se ela nunca esteve num setor, vai para a equipe toda.")
              : c.setor_id
              ? t(
                  "A conversa vai para a fila do setor e fica como Aguardando até alguém pegar. A Distribuição de atendimento só a entrega a quem é do setor.",
                )
              : t(
                  "A conversa vai para a fila de atendentes e fica como Aguardando até alguém pegar. A Distribuição de atendimento escolhe quem pega.",
                )}
          </p>
          {opcoes.setores.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t("Para mandar a um setor específico, crie os setores em Configurações › Setores.")}
            </p>
          ) : null}
          <Texto
            id="equipe-msg"
            rotulo={t("Mensagem antes de transferir (opcional)")}
            valor={c.mensagem}
            linhas={3}
            onCommit={(v) => aplicar({ mensagem: v })}
          />
          <EsperaDoAtendente dados={dados} tipo="transferir_equipe" aplicar={aplicar} />
        </>
      );
    }
    case "transferir_atendente": {
      const c = lerConfig("transferir_atendente", dados);
      const comLista = c.modo === "rodizio" || c.modo === "menos_conversas";
      return (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="atendente-modo">{t("Para quem")}</Label>
            <select
              id="atendente-modo"
              className={SELECT}
              value={c.modo}
              onChange={(e) => aplicar({ modo: e.target.value as ModoDeAtendente })}
            >
              {MODOS_DE_ATENDENTE.map((m) => (
                <option key={m} value={m}>
                  {t(NOMES_DO_MODO_DE_ATENDENTE[m])}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {t(EXPLICACAO_DO_MODO_DE_ATENDENTE[c.modo])}
            </p>
          </div>
          {c.modo === "especifico" ? (
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
          ) : null}
          {c.modo === "variavel" ? (
            <Texto
              id="atendente-variavel"
              rotulo={t("Variável com o atendente")}
              valor={c.variavel}
              placeholder="atendente"
              onCommit={(v) =>
                aplicar({ variavel: v.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^[0-9]/, "_$&").slice(0, 40) })
              }
              ajuda={t("O id ou o e-mail de alguém da equipe, guardado antes no fluxo (por exemplo, por um WebHook).")}
            />
          ) : null}
          {comLista && opcoes.atendentes.length > 0 ? (
            <div className="space-y-1.5" data-testid="atendentes-do-rodizio">
              <Label>{t("Só entre estes (opcional)")}</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {opcoes.atendentes.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={c.atendentes.includes(a.id)}
                      onChange={(e) =>
                        aplicar({
                          atendentes: e.target.checked
                            ? [...c.atendentes, a.id]
                            : c.atendentes.filter((x) => x !== a.id),
                        })
                      }
                    />
                    {a.nome}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t(
                  "Sem ninguém marcado, entra quem pode receber esta conversa pelas regras do número e do setor.",
                )}
              </p>
            </div>
          ) : null}
          <Texto
            id="atendente-msg"
            rotulo={c.modo === "remover" ? t("Mensagem antes de remover (opcional)") : t("Mensagem antes de transferir (opcional)")}
            valor={c.mensagem}
            linhas={3}
            onCommit={(v) => aplicar({ mensagem: v })}
          />
          {c.modo === "remover" ? null : (
            <EsperaDoAtendente dados={dados} tipo="transferir_atendente" aplicar={aplicar} />
          )}
        </>
      );
    }
    case "editar_etiquetas": {
      const c = lerConfig("editar_etiquetas", dados);
      return (
        <>
          <div className="space-y-1.5">
            <Label>{t("Onde mexer")}</Label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="tags-alvo"
                checked={c.alvo === "contato"}
                onChange={() => aplicar({ alvo: "contato" })}
              />
              {t("Etiquetas do contato")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="tags-alvo"
                checked={c.alvo === "conversa"}
                onChange={() => aplicar({ alvo: "conversa" })}
              />
              {t("Etiquetas da conversa")}
            </label>
            <p className="text-xs text-muted-foreground">
              {c.alvo === "conversa"
                ? t("Valem só para este atendimento. A conversa guarda até 20 etiquetas.")
                : t("Seguem com o contato em todas as conversas e disparam as automações de etiqueta.")}
            </p>
          </div>
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
    case "criar_nota": {
      const c = lerConfig("criar_nota", dados);
      return (
        <Texto
          id="nota-interna"
          rotulo={t("Texto da nota")}
          valor={c.texto}
          linhas={5}
          onCommit={(v) => aplicar({ texto: v })}
          ajuda={t(
            'A nota aparece na conversa só para a equipe. Use {{nome}} para incluir o que o contato respondeu em "Pedir para digitar".',
          )}
        />
      );
    }
    case "campo_contato":
      return <CampoDoContato dados={dados} aplicar={aplicar} />;
    case "definir_condicao": {
      const c = lerConfig("definir_condicao", dados);
      return (
        <>
          <EditorDeRegra id="regra" regra={c.regra} onChange={(regra) => aplicar({ regra })} />
          <p className="text-xs text-muted-foreground">
            {t('Se a regra valer, segue por "Regra atendida"; senão, por "Regra não atendida".')}
          </p>
        </>
      );
    }
    case "condicao_campo_contato": {
      const c = lerConfig("condicao_campo_contato", dados);
      return (
        <>
          <EditorDeRegra
            id="regra-campo"
            regra={{ ...c.regra, fonte: "campo_contato" }}
            fonteFixa
            onChange={(regra) => aplicar({ regra: { ...regra, fonte: "campo_contato" } })}
          />
          <p className="text-xs text-muted-foreground">
            {t('Se a regra valer, segue por "Regra atendida"; senão, por "Regra não atendida".')}
          </p>
        </>
      );
    }
    case "multi_condicional":
      return <MultiCondicional dados={dados} aplicar={aplicar} />;
    case "pedir_avaliacao": {
      const c = lerConfig("pedir_avaliacao", dados);
      return (
        <>
          <Texto
            id="avaliar-pergunta"
            rotulo={t("Pergunta")}
            valor={c.pergunta}
            linhas={3}
            onCommit={(v) => aplicar({ pergunta: v })}
          />
          <div className="space-y-1.5">
            <Label htmlFor="avaliar-escala">{t("Escala")}</Label>
            <select
              id="avaliar-escala"
              className={SELECT}
              value={c.escala}
              onChange={(e) => aplicar({ escala: e.target.value })}
            >
              <option value="1_5">{t("De 1 a 5")}</option>
              <option value="0_10">{t("De 0 a 10")}</option>
            </select>
          </div>
          <Texto
            id="avaliar-invalida"
            rotulo={t("Se a resposta não for uma nota")}
            valor={c.mensagem_invalida}
            linhas={2}
            onCommit={(v) => aplicar({ mensagem_invalida: v })}
          />
          <div className="space-y-1.5">
            <Label htmlFor="avaliar-tentativas">
              {t('Tentativas antes de seguir por "Não avaliou"')}
            </Label>
            <select
              id="avaliar-tentativas"
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
          <p className="text-xs text-muted-foreground">
            {t(
              'A nota fica em {{avaliacao}}, aparece na conversa como nota interna e entra na média da lista de chatbots. Para separar nota boa de ruim, ligue a um "Definir condição" com "É maior ou igual a".',
            )}
          </p>
        </>
      );
    }
    case "pedir_feedback": {
      const c = lerConfig("pedir_feedback", dados);
      return (
        <Texto
          id="feedback-pergunta"
          rotulo={t("Pergunta")}
          valor={c.pergunta}
          linhas={3}
          onCommit={(v) => aplicar({ pergunta: v })}
          ajuda={t(
            "O comentário do contato vai para a conversa como nota interna e fica em {{feedback}}.",
          )}
        />
      );
    }
    case "notificar_atendente": {
      const c = lerConfig("notificar_atendente", dados);
      return (
        <>
          <Texto
            id="notificar-msg"
            rotulo={t("Motivo do aviso")}
            valor={c.mensagem}
            linhas={3}
            placeholder={t("Ex.: Cliente quer falar sobre cancelamento")}
            onCommit={(v) => aplicar({ mensagem: v })}
            ajuda={t(
              "Abre um aviso na Central de avisos, com som e notificação para a equipe, que leva à conversa. As respostas do contato ({{nome}}) entram só na nota da conversa, não no aviso.",
            )}
          />
          {opcoes.atendentes.length > 0 ? (
            <div className="space-y-1.5" data-testid="notificar-quem">
              <Label>{t("Avisar só estes atendentes (opcional)")}</Label>
              <div className="grid grid-cols-2 gap-1.5">
                {opcoes.atendentes.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={c.atendentes.includes(a.id)}
                      onChange={(e) =>
                        aplicar({
                          atendentes: e.target.checked
                            ? [...c.atendentes, a.id]
                            : c.atendentes.filter((x) => x !== a.id),
                        })
                      }
                    />
                    {a.nome}
                  </label>
                ))}
              </div>
              {c.atendentes.length > 0 ? (
                <label className="flex items-start gap-2 pt-1 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={c.so_disponiveis}
                    onChange={(e) => aplicar({ so_disponiveis: e.target.checked })}
                  />
                  <span>
                    {t("Somente se estiver disponível")}
                    <span className="block text-xs text-muted-foreground">
                      {t("Quem estiver indisponível não é avisado. Se ninguém puder ser avisado, o aviso vai para a Central de avisos.")}
                    </span>
                  </span>
                </label>
              ) : null}
              <p className="text-xs text-muted-foreground">
                {t("Com nomes marcados, o aviso vai ao celular de cada um e fica como nota na conversa. Sem ninguém marcado, vai para a equipe toda pela Central.")}
              </p>
            </div>
          ) : null}
        </>
      );
    }
    case "aguardar_intervalo":
      return <AguardarIntervalo dados={dados} aplicar={aplicar} />;
    case "webhook":
      return <WebhookDoChatbot dados={dados} aplicar={aplicar} />;
    case "iniciar_followup": {
      const c = lerConfig("iniciar_followup", dados);
      const lista = opcoes.followups.filter((f) => !f.roteiro);
      const roteiros = opcoes.followups.filter((f) => f.roteiro).length;
      const escolhido = lista.find((f) => f.id === c.pointer_id);
      const publicados = lista.filter((f) => f.situacao === "publicado").length;
      return (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="followup">{t("Follow-up")}</Label>
            <select
              id="followup"
              className={SELECT}
              value={c.pointer_id ?? ""}
              onChange={(e) =>
                aplicar({
                  pointer_id: e.target.value || null,
                  nome_do_followup: lista.find((f) => f.id === e.target.value)?.nome ?? "",
                })
              }
            >
              <option value="">{t("Escolha um follow-up")}</option>
              {lista.map((f) => (
                <option
                  key={f.id}
                  value={f.id}
                  // O que já está escolhido continua selecionável, para a tela
                  // não esconder a escolha que o fluxo tem.
                  disabled={f.situacao !== "publicado" && f.id !== c.pointer_id}
                >
                  {f.situacao === "publicado" ? f.nome : `${f.nome} — ${t(SITUACAO_DO_FOLLOWUP[f.situacao])}`}
                </option>
              ))}
            </select>
          </div>
          {escolhido && escolhido.situacao !== "publicado" ? (
            <p
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-300"
              data-testid="followup-nao-publicado"
            >
              {t(
                "Este follow-up não está publicado: o contato não entra nele, e a conversa ganha uma nota dizendo isso. Publique em IA › Follow-ups.",
              )}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {lista.length === 0
              ? t("Nenhum follow-up criado ainda. Crie e publique um em IA › Follow-ups.")
              : publicados === 0
                ? t("Nenhum follow-up publicado ainda: só o publicado pode ser escolhido. Publique um em IA › Follow-ups.")
                : t(
                    "O contato entra no follow-up como se o agente de IA o tivesse armado. Se ele já estiver em outro follow-up ativo, fica no que está — e a conversa ganha uma nota dizendo isso.",
                  )}
          </p>
          {roteiros > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t(
                "Roteiros de atendimento não aparecem aqui: quem os conduz é o agente de IA. Para usar um, passe a conversa ao agente com “Transferir p/ agentes de IA” — o roteiro começa pelo gatilho dele.",
              )}
            </p>
          ) : null}
        </>
      );
    }
    case "aguardar_ate": {
      const c = lerConfig("aguardar_ate", dados);
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
        <>
          <div className="space-y-1.5">
            <Label htmlFor="ate-quando">{t("Seguir")}</Label>
            <select
              id="ate-quando"
              className={SELECT}
              value={c.quando}
              onChange={(e) => aplicar({ quando: e.target.value })}
            >
              <option value="dias">{t("No próximo horário, nos dias da semana marcados")}</option>
              <option value="data">{t("Numa data")}</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ate-hora">{t("Horário")}</Label>
            <Input
              id="ate-hora"
              type="time"
              value={c.hora}
              onChange={(e) => e.target.value && aplicar({ hora: e.target.value })}
            />
          </div>
          {c.quando === "data" ? (
            <AguardarAteData dados={dados} aplicar={aplicar} />
          ) : (
          <div className="space-y-1.5">
            <Label>{t("Nos dias")}</Label>
            {nomes.map((n, i) => (
              <label key={i} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={c.dias.includes(i)}
                  disabled={c.dias.length === 1 && c.dias.includes(i)}
                  onChange={(e) =>
                    aplicar({
                      dias: e.target.checked ? [...c.dias, i].sort() : c.dias.filter((d) => d !== i),
                    })
                  }
                />
                {n}
              </label>
            ))}
            <p className="text-xs text-muted-foreground">
              {t("O fluxo segue no próximo horário marcado, no fuso horário da empresa.")}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => aplicar({ dias: [1, 2, 3, 4, 5], pular_feriados: true })}
              >
                {t("Só dia útil")}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => aplicar({ dias: [0, 1, 2, 3, 4, 5, 6] })}>
                {t("Próximo dia, qualquer um")}
              </Button>
            </div>
            <label className="flex items-start gap-2 pt-1 text-sm">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={c.pular_feriados}
                onChange={(e) => aplicar({ pular_feriados: e.target.checked })}
                data-testid="pular-feriados"
              />
              <span>
                {t("Pular feriados nacionais")}
                <span className="block text-xs text-muted-foreground">
                  {t("Em feriado o fluxo espera o próximo dia marcado.")}
                </span>
              </span>
            </label>
          </div>
          )}
          <SeResponder valor={c.se_responder} aplicar={aplicar} />
        </>
      );
    }
    case "enviar_midia":
      return (
        <EnviarMidia
          dados={dados}
          fluxoId={opcoes.fluxoAtual}
          biblioteca={opcoes.midias}
          aplicar={aplicar}
        />
      );
    case "agendar_horario":
      return <AgendarHorario dados={dados} opcoes={opcoes} aplicar={aplicar} />;
    case "reagendar_horario":
      return <AgendarHorario dados={dados} opcoes={opcoes} aplicar={aplicar} reagendar />;
    case "cancelar_agendamento": {
      const c = lerConfig("cancelar_agendamento", dados);
      return (
        <>
          <Texto
            id="cancelar-motivo"
            rotulo={t("Motivo que fica no compromisso")}
            valor={c.motivo}
            onCommit={(v) => aplicar({ motivo: v })}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              'Cancela o próximo compromisso do contato na Agenda, como o botão da tela. O horário cancelado fica em {{agendamento}}. Sem compromisso futuro, segue por "Sem agendamento". Para pedir confirmação antes, ponha um "Pedir para escolher" na frente.',
            )}
          </p>
        </>
      );
    }
    case "etapa_do_funil": {
      const c = lerConfig("etapa_do_funil", dados);
      const funil = opcoes.funis.find((f) => f.id === c.pipeline_id);
      return (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="etapa-funil">{t("Funil")}</Label>
            <select
              id="etapa-funil"
              className={SELECT}
              value={c.pipeline_id ?? ""}
              onChange={(e) => {
                const f = opcoes.funis.find((x) => x.id === e.target.value);
                aplicar({ pipeline_id: f?.id ?? null, nome_do_funil: f?.nome ?? "", etapas: [] });
              }}
            >
              <option value="">{t("Escolha um funil")}</option>
              {opcoes.funis.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>
          {funil ? (
            <div className="space-y-1.5">
              <Label>{t("Etapas (opcional)")}</Label>
              {funil.etapas.map((et) => (
                <label key={et.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={c.etapas.includes(et.id)}
                    onChange={(e) =>
                      aplicar({
                        etapas: e.target.checked
                          ? [...c.etapas, et.id]
                          : c.etapas.filter((x) => x !== et.id),
                      })
                    }
                  />
                  {et.nome}
                </label>
              ))}
              <p className="text-xs text-muted-foreground">
                {t(
                  'Segue por "Está" quando o contato tem negócio aberto neste funil numa das etapas marcadas. Sem etapa marcada: em qualquer etapa do funil.',
                )}
              </p>
            </div>
          ) : null}
        </>
      );
    }
    case "negocio_funil":
      return <NegocioNoFunil dados={dados} opcoes={opcoes} aplicar={aplicar} />;
    case "acionar_fluxo": {
      const c = lerConfig("acionar_fluxo", dados);
      return (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="acionar-fluxo">{t("Fluxo")}</Label>
            <select
              id="acionar-fluxo"
              className={SELECT}
              value={c.flow_id ?? ""}
              onChange={(e) => {
                const f = opcoes.fluxos.find((x) => x.id === e.target.value);
                aplicar({ flow_id: f?.id ?? null, nome_do_fluxo: f?.nome ?? "" });
              }}
            >
              <option value="">{t("Escolha um fluxo")}</option>
              {opcoes.fluxos.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id === opcoes.fluxoAtual
                    ? `${f.nome} (${t("este fluxo — volta ao início")})`
                    : f.ligado
                      ? f.nome
                      : `${f.nome} (${t("desligado")})`}
                </option>
              ))}
            </select>
          </div>
          {c.flow_id && opcoes.fluxos.some((f) => f.id === c.flow_id && !f.ligado) ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t("Esse fluxo está desligado: ligue-o, senão o contato fica sem resposta neste ponto.")}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t(
              'Este fluxo termina aqui e o escolhido começa do início, com as respostas já guardadas ({{nome}}…). Para um submenu, crie o outro fluxo com "Iniciar por automação": ele pode ficar ligado junto com este. Escolha este mesmo fluxo para voltar ao menu.',
            )}
          </p>
        </>
      );
    }
    case "valor":
      return <ValorDoPasso dados={dados} aplicar={aplicar} />;
    case "transferir_ia": {
      const c = lerConfig("transferir_ia", dados);
      const agentes = opcoes.agentes ?? [];
      return (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="ia-agente">{t("Agente de IA")}</Label>
            <select
              id="ia-agente"
              data-testid="ia-agente"
              className={SELECT}
              value={c.agent_id ?? ""}
              onChange={(e) => aplicar({ agent_id: e.target.value || null })}
            >
              <option value="">{t("O agente deste número (ou o roteador)")}</option>
              {agentes.map((a) => (
                <option key={a.id} value={a.id} disabled={!a.publicado && a.id !== c.agent_id}>
                  {a.publicado ? a.nome : `${a.nome} — ${t("não publicado")}`}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            {c.agent_id
              ? t(
                  "O agente escolhido responde dali em diante, inclusive a mensagem que o contato acabou de mandar, até o atendimento ser finalizado. O chatbot não volta a entrar neste atendimento.",
                )
              : t(
                  "A conversa volta para o atendimento automático: o agente de IA deste número (ou o roteador) responde dali em diante, inclusive a mensagem que o contato acabou de mandar. O chatbot não volta a entrar neste atendimento.",
                )}
          </p>
          <Texto
            id="ia-msg"
            rotulo={t("Mensagem antes de transferir (opcional)")}
            valor={c.mensagem}
            linhas={3}
            onCommit={(v) => aplicar({ mensagem: v })}
            ajuda={t(
              'Só é enviada se o agente estiver publicado (ou, sem agente escolhido, se houver agente no ar neste número). Se não houver, o fluxo segue por "Sem agente de IA" — ligue ali um "Transferir para a equipe".',
            )}
          />
        </>
      );
    }
    case "enviar_template":
      return <EnviarTemplate dados={dados} opcoes={opcoes} aplicar={aplicar} />;
    case "enviar_formulario":
      return <EnviarFormulario dados={dados} aplicar={aplicar} />;
    case "visibilidade_conversa": {
      const c = lerConfig("visibilidade_conversa", dados);
      const opcoes = [
        ["visivel", t("Visível")],
        ["oculta", t("Oculta")],
        ["oculta_ate_mensagem", t("Oculta até a próxima mensagem do contato")],
      ] as const;
      return (
        <>
          <div className="space-y-1.5">
            <Label>{t("Como deixar a conversa")}</Label>
            {opcoes.map(([valor, rotulo]) => (
              <label key={valor} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="visibilidade-conversa"
                  checked={c.visibilidade === valor}
                  onChange={() => aplicar({ visibilidade: valor })}
                />
                {rotulo}
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              'Oculta, a conversa sai da caixa de entrada sem ser fechada e aparece no filtro "Ocultas" da tela de Conversas. "Até a próxima mensagem" volta sozinha quando o contato escrever.',
            )}
          </p>
        </>
      );
    }
    case "privar_liberar": {
      const c = lerConfig("privar_liberar", dados);
      return (
        <>
          <div className="space-y-1.5">
            <Label>{t("O que fazer")}</Label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="privar-acao"
                checked={c.acao === "privar"}
                onChange={() => aplicar({ acao: "privar" })}
              />
              {t("Tornar a conversa privada")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="privar-acao"
                checked={c.acao === "liberar"}
                onChange={() => aplicar({ acao: "liberar" })}
              />
              {t("Liberar a conversa")}
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "Privada, a conversa só aparece para o atendente responsável e para os gestores. Use depois de transferir para um atendente: sem responsável, só os gestores a veem até alguém assumi-la.",
            )}
          </p>
        </>
      );
    }
    case "fluxo_de_espera": {
      const c = lerConfig("fluxo_de_espera", dados);
      return (
        <>
          <div className="space-y-1.5">
            <Label>{t("O que fazer")}</Label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="espera-acao"
                checked={c.acao === "desligar"}
                onChange={() => aplicar({ acao: "desligar" })}
              />
              {t("Desligar as mensagens de espera")}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="espera-acao"
                checked={c.acao === "ligar"}
                onChange={() => aplicar({ acao: "ligar" })}
              />
              {t("Ligar de novo as mensagens de espera")}
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              'As mensagens de espera são as que "Transferir para a equipe" e "Transferir p/ atendente" mandam enquanto ninguém responde. Desligar para as que estão programadas nesta conversa; ligar volta a programá-las, se ainda faltarem vezes e ninguém da equipe tiver respondido. Quando um atendente aciona um fluxo, ou uma automação começa um, elas já param sozinhas: nesses fluxos, use "Ligar" para mantê-las.',
            )}
          </p>
        </>
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
      .map((o) => o.trim().slice(0, 80))
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
              maxLength={80}
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
        <p className="text-xs text-muted-foreground">
          {t(
            "Em número da API oficial da Meta, até 3 opções de até 20 letras viram botões, e até 10 opções de até 24 letras viram lista. Em QR Code, vão numeradas.",
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
      <Texto
        id="escolher-variavel"
        rotulo={t("Guardar a escolha em (opcional)")}
        valor={c.variavel}
        onCommit={(v) => aplicar({ variavel: comoChave(v) })}
        ajuda={t(
          "O texto da opção escolhida fica guardado: use {{nome_que_você_escolheu}} numa mensagem, no WebHook ou no “Valor”. Vazio = não guarda.",
        )}
      />
      <PrazoDaResposta id="escolher-prazo" valor={c.prazo_minutos} aplicar={aplicar} />
    </>
  );
}

const SITUACAO_DO_FOLLOWUP = {
  rascunho: "rascunho, publique para usar",
  desligado: "desligado",
} as const;

const AVISO_DO_LINK: Record<ProblemaDoLink, string> = {
  protocolo_perigoso:
    "Este endereço não abre uma página e é usado em golpes. O fluxo não liga com ele.",
  malformado: "Este link está incompleto. Confira o endereço — o fluxo não liga com ele.",
  sem_https:
    "Este link começa com http://. Prefira https:// — muitos celulares avisam que a página não é segura.",
};

function AvisosDeLink({ texto }: { texto: string }) {
  const t = useT();
  const problemas = linksDoTexto(texto).filter((l) => l.problema);
  if (!problemas.length) return null;
  return (
    <ul className="space-y-1" data-testid="avisos-de-link">
      {problemas.map((l, i) => (
        <li
          key={i}
          className={`rounded-md border px-2 py-1.5 text-xs ${
            l.problema === "sem_https"
              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          <span className="block break-all font-mono">{l.link}</span>
          {t(AVISO_DO_LINK[l.problema as ProblemaDoLink])}
        </li>
      ))}
    </ul>
  );
}

const DESLOCAMENTOS_DA_DATA = [-7, -3, -2, -1, 0, 1, 2, 3, 7] as const;
const NOMES_DO_DESLOCAMENTO: Record<(typeof DESLOCAMENTOS_DA_DATA)[number], string> = {
  [-7]: "7 dias antes",
  [-3]: "3 dias antes",
  [-2]: "2 dias antes",
  [-1]: "1 dia antes (véspera)",
  0: "No próprio dia",
  1: "1 dia depois",
  2: "2 dias depois",
  3: "3 dias depois",
  7: "7 dias depois",
};

function AguardarAteData({
  dados,
  aplicar,
}: {
  dados: NodeData;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const c = lerConfig("aguardar_ate", dados);
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="ate-fonte">{t("A data")}</Label>
        <select
          id="ate-fonte"
          className={SELECT}
          value={c.fonte_da_data}
          onChange={(e) => aplicar({ fonte_da_data: e.target.value })}
        >
          <option value="fixa">{t("Uma data que eu escolho")}</option>
          <option value="resposta">{t("Uma data guardada numa resposta")}</option>
        </select>
      </div>
      {c.fonte_da_data === "fixa" ? (
        <div className="space-y-1.5">
          <Label htmlFor="ate-data">{t("Dia")}</Label>
          <Input
            id="ate-data"
            type="date"
            value={c.data}
            onChange={(e) => aplicar({ data: e.target.value })}
          />
        </div>
      ) : (
        <Texto
          id="ate-variavel"
          rotulo={t("Nome da resposta com a data")}
          valor={c.variavel}
          placeholder="data_consulta"
          onCommit={(v) =>
            // Só o que o formato aceita: um valor inválido zeraria o passo inteiro.
            aplicar({
              variavel: v
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9_]/g, "_")
                .replace(/^[^a-z_]+/, "")
                .slice(0, 40),
            })
          }
          ajuda={t(
            "A resposta de um Pedir para digitar no formato data (dd/mm/aaaa), ou horario_inicio, que o Agendar horário guarda ao marcar.",
          )}
        />
      )}
      <div className="space-y-1.5">
        <Label htmlFor="ate-deslocamento">{t("Quando")}</Label>
        <select
          id="ate-deslocamento"
          className={SELECT}
          value={c.deslocamento_dias}
          onChange={(e) => aplicar({ deslocamento_dias: Number(e.target.value) })}
        >
          {DESLOCAMENTOS_DA_DATA.map((d) => (
            <option key={d} value={d}>
              {t(NOMES_DO_DESLOCAMENTO[d])}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {t(
            "No horário acima, no fuso da empresa. Se a data já passou, faltou ou está a mais de um ano, o fluxo não espera e segue por “Sem data válida” — sem nada ligado ali, ele termina.",
          )}
        </p>
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
            // Apagar o horário gravava "" e a config INTEIRA voltava ao padrão
            // 08–18 sem aviso; vazio não é horário, então não grava.
            onChange={(e) =>
              e.target.value &&
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
            // Apagar o horário gravava "" e a config INTEIRA voltava ao padrão
            // 08–18 sem aviso; vazio não é horário, então não grava.
            onChange={(e) =>
              e.target.value &&
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
      <div className="space-y-2 pt-2">
        <Label>{t("Feriados")}</Label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={c.feriados_nacionais}
            onChange={(e) => aplicar({ feriados_nacionais: e.target.checked })}
          />
          <span>
            {t("Feriados nacionais contam como fora do horário")}
            <span className="block text-xs text-muted-foreground">
              {t(
                "Ano-Novo, Sexta-feira Santa, Tiradentes, Dia do Trabalho, Independência, Nossa Senhora Aparecida, Finados, Proclamação da República, Consciência Negra e Natal.",
              )}
            </span>
          </span>
        </label>
        {c.feriados_nacionais ? (
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={c.pontos_facultativos}
              onChange={(e) => aplicar({ pontos_facultativos: e.target.checked })}
            />
            <span>{t("Também Carnaval (segunda e terça) e Corpus Christi")}</span>
          </label>
        ) : null}
        <Texto
          id="horarios-feriados"
          rotulo={t("Outros dias fechados")}
          valor={c.feriados.join(", ")}
          placeholder="20/01, 09/07, 24/12/2026"
          onCommit={(v) => aplicar({ feriados: lerDatasDeFeriado(v) })}
          ajuda={t(
            "Feriados do estado ou da cidade e dias de folga, separados por vírgula. 25/12 vale todo ano; 24/12/2026, só naquele dia.",
          )}
        />
      </div>
    </div>
  );
}

function CampoDoContato({
  dados,
  aplicar,
}: {
  dados: NodeData;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const c = lerConfig("campo_contato", dados);
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="campo-qual">{t("Campo")}</Label>
        <select
          id="campo-qual"
          className={SELECT}
          value={c.campo}
          onChange={(e) => aplicar({ campo: e.target.value })}
        >
          <option value="nome">{t("Nome")}</option>
          <option value="email">{t("E-mail")}</option>
          <option value="aniversario">{t("Aniversário")}</option>
          <option value="personalizado">{t("Campo personalizado")}</option>
        </select>
      </div>
      {c.campo === "personalizado" ? (
        <Texto
          id="campo-chave"
          rotulo={t("Nome do campo personalizado")}
          valor={c.chave}
          placeholder="cidade"
          onCommit={(v) => aplicar({ chave: comoChave(v) })}
          ajuda={t("Letras minúsculas, números e _. O mesmo nome usado na ficha do contato.")}
        />
      ) : null}
      <Texto
        id="campo-valor"
        rotulo={t("Valor a gravar")}
        valor={c.valor}
        placeholder="{{resposta}}"
        onCommit={(v) => aplicar({ valor: v })}
        ajuda={
          c.campo === "aniversario"
            ? t("Use {{nome}} para gravar o que o contato digitou. A data precisa vir como dd/mm/aaaa.")
            : t('Use {{nome}} para gravar o que o contato respondeu em "Pedir para digitar".')
        }
      />
      <p className="text-xs text-muted-foreground">
        {t(
          'Se o valor não servir (um e-mail sem @, uma data que não existe), nada é gravado e o fluxo segue por "Valor inválido" — ligue essa saída de volta à pergunta para pedir de novo.',
        )}
      </p>
    </>
  );
}

const CAMPOS_FIXOS = ["nome", "email", "aniversario"];

function EditorDeRegra({
  id,
  regra,
  onChange,
  fonteFixa = false,
}: {
  id: string;
  regra: Regra;
  onChange: (r: Regra) => void;
  /** O card já diz o que olhar (ex.: "Campo do contato"): some o "Olhar para". */
  fonteFixa?: boolean;
}) {
  const t = useT();
  const mudar = (parcial: Partial<Regra>) => onChange({ ...regra, ...parcial });
  const etiqueta = regra.fonte === "etiqueta";
  const semValor = regra.operador === "preenchido" || regra.operador === "vazio";
  const campoOutro = regra.fonte === "campo_contato" && !CAMPOS_FIXOS.includes(regra.chave);

  return (
    <div className="space-y-3">
      <div className={fonteFixa ? "hidden" : "space-y-1.5"}>
        <Label htmlFor={`${id}-fonte`}>{t("Olhar para")}</Label>
        <select
          id={`${id}-fonte`}
          className={SELECT}
          value={regra.fonte}
          onChange={(e) => {
            const fonte = e.target.value as Regra["fonte"];
            const operador =
              fonte === "etiqueta"
                ? regra.operador === "nao_tem" || regra.operador === "diferente"
                  ? "nao_tem"
                  : "tem"
                : regra.operador === "tem"
                  ? "contem"
                  : regra.operador === "nao_tem"
                    ? "diferente"
                    : regra.operador;
            mudar({
              fonte,
              operador,
              chave: fonte === "campo_contato" ? "nome" : fonte === "variavel" ? regra.chave : "",
            });
          }}
        >
          <option value="etiqueta">{t("Etiqueta do contato ou da conversa")}</option>
          <option value="variavel">{t("Resposta guardada")}</option>
          <option value="campo_contato">{t("Campo do contato")}</option>
          <option value="mensagem">{t("Última mensagem do contato")}</option>
        </select>
      </div>

      {regra.fonte === "variavel" ? (
        <Texto
          id={`${id}-var`}
          rotulo={t("Nome da resposta")}
          valor={regra.chave}
          placeholder="resposta"
          onCommit={(v) => mudar({ chave: comoChave(v) })}
          ajuda={t('O nome que você pôs em "Guardar a resposta em", no "Pedir para digitar".')}
        />
      ) : null}

      {regra.fonte === "campo_contato" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-campo`}>{t("Campo")}</Label>
            <select
              id={`${id}-campo`}
              className={SELECT}
              value={campoOutro ? "__outro" : regra.chave}
              onChange={(e) => mudar({ chave: e.target.value === "__outro" ? "" : e.target.value })}
            >
              <option value="nome">{t("Nome")}</option>
              <option value="email">{t("E-mail")}</option>
              <option value="aniversario">{t("Aniversário")}</option>
              <option value="__outro">{t("Campo personalizado")}</option>
            </select>
          </div>
          {campoOutro ? (
            <Texto
              id={`${id}-chave`}
              rotulo={t("Nome do campo personalizado")}
              valor={regra.chave}
              placeholder="cidade"
              onCommit={(v) => mudar({ chave: comoChave(v) })}
            />
          ) : null}
        </>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor={`${id}-op`}>{t("Condição")}</Label>
        <select
          id={`${id}-op`}
          className={SELECT}
          value={regra.operador}
          onChange={(e) => mudar({ operador: e.target.value as Regra["operador"] })}
        >
          {etiqueta ? (
            <>
              <option value="tem">{t("Tem a etiqueta")}</option>
              <option value="nao_tem">{t("Não tem a etiqueta")}</option>
            </>
          ) : (
            <>
              <option value="igual">{t("É igual a")}</option>
              <option value="diferente">{t("É diferente de")}</option>
              <option value="contem">{t("Contém")}</option>
              <option value="nao_tem">{t("Não contém")}</option>
              <option value="preenchido">{t("Está preenchido")}</option>
              <option value="vazio">{t("Está vazio")}</option>
              <option value="maior_ou_igual">{t("É maior ou igual a (número)")}</option>
              <option value="menor_ou_igual">{t("É menor ou igual a (número)")}</option>
            </>
          )}
        </select>
      </div>

      {semValor ? null : (
        <Texto
          id={`${id}-valor`}
          rotulo={etiqueta ? t("Etiqueta") : t("Valor")}
          valor={regra.valor}
          onCommit={(v) => mudar({ valor: v })}
          ajuda={t("Maiúsculas e acentos não importam.")}
        />
      )}
    </div>
  );
}

function MultiCondicional({
  dados,
  aplicar,
}: {
  dados: NodeData;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const c = lerConfig("multi_condicional", dados);
  const gravar = (regras: Regra[]) => aplicar({ regras });
  return (
    <div className="space-y-4">
      {c.regras.map((r, i) => (
        <div key={`${i}-${c.regras.length}`} className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold">
              {t("Regra")} {i + 1}
            </span>
            <button
              type="button"
              disabled={c.regras.length <= 1}
              onClick={() => gravar(c.regras.filter((_, j) => j !== i))}
              className="text-muted-foreground hover:text-destructive disabled:opacity-30"
              aria-label={t("Remover regra")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <Texto
            id={`multi-${i}-rotulo`}
            rotulo={t("Nome da saída (opcional)")}
            valor={r.rotulo}
            placeholder={t("Ex.: Financeiro")}
            onCommit={(v) => gravar(c.regras.map((x, j) => (j === i ? { ...x, rotulo: v } : x)))}
          />
          <EditorDeRegra
            id={`multi-${i}`}
            regra={r}
            onChange={(nova) => gravar(c.regras.map((x, j) => (j === i ? nova : x)))}
          />
        </div>
      ))}
      {c.regras.length < 8 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => gravar([...c.regras, regraSchema.parse({})])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("Adicionar regra")}
        </Button>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t(
          'Vale a primeira regra que bater, de cima para baixo. Se nenhuma bater, segue por "Nenhuma regra".',
        )}
      </p>
    </div>
  );
}

function SeResponder({
  valor,
  aplicar,
}: {
  valor: "seguir" | "esperar";
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-1.5">
      <Label>{t("Se o contato mandar mensagem antes")}</Label>
      {(["seguir", "esperar"] as const).map((v) => (
        <label key={v} className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="se-responder"
            className="mt-1"
            checked={valor === v}
            onChange={() => aplicar({ se_responder: v })}
          />
          {v === "seguir"
            ? t("Seguir o fluxo na hora")
            : t("Continuar esperando (a mensagem fica para a equipe ver)")}
        </label>
      ))}
    </div>
  );
}

function AguardarIntervalo({
  dados,
  aplicar,
}: {
  dados: NodeData;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const c = lerConfig("aguardar_intervalo", dados);
  const [qtd, setQtd] = useState(String(c.quantidade));
  const gravar = () => {
    const n = Math.min(999, Math.max(1, Math.round(Number(qtd) || 1)));
    setQtd(String(n));
    if (n !== c.quantidade) aplicar({ quantidade: n });
  };
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="intervalo-qtd">{t("Esperar")}</Label>
        <div className="flex gap-2">
          <Input
            id="intervalo-qtd"
            type="number"
            min={1}
            max={999}
            className="w-24"
            value={qtd}
            onChange={(e) => setQtd(e.target.value)}
            onBlur={gravar}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          />
          <select
            aria-label={t("Unidade")}
            className={SELECT}
            value={c.unidade}
            onChange={(e) => aplicar({ unidade: e.target.value })}
          >
            <option value="segundos">{t("segundos")}</option>
            <option value="minutos">{t("minutos")}</option>
            <option value="horas">{t("horas")}</option>
            <option value="dias">{t("dias")}</option>
          </select>
        </div>
        <p className="text-xs text-muted-foreground">{t("No máximo 30 dias.")}</p>
      </div>
      <SeResponder valor={c.se_responder} aplicar={aplicar} />
    </>
  );
}

function SegredoDoWebhook({
  id,
  rotulo,
  ajuda,
  placeholder,
  definido,
  pendente,
  aoDigitar,
  aoRemover,
}: {
  id: string;
  rotulo: string;
  ajuda: string;
  placeholder?: string;
  definido: boolean;
  pendente: boolean;
  aoDigitar: (v: string) => void;
  aoRemover: () => void;
}) {
  const t = useT();
  const [v, setV] = useState("");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        type="password"
        autoComplete="off"
        value={v}
        placeholder={definido ? t("Definido — digite para trocar") : placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v.trim() && aoDigitar(v.trim())}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {pendente ? t("Será cifrado quando você salvar o fluxo.") : ajuda}
        </p>
        {definido || pendente ? (
          <button
            type="button"
            className="shrink-0 text-xs text-destructive hover:underline"
            onClick={() => {
              setV("");
              aoRemover();
            }}
          >
            {t("Remover")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function WebhookDoChatbot({
  dados,
  aplicar,
}: {
  dados: NodeData;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const c = lerConfig("webhook", dados);
  const [campos, setCampos] = useState(c.campos);
  const gravar = (lista: typeof campos) => {
    const limpa = lista
      .map((x) => ({ caminho: x.caminho.trim(), variavel: comoChave(x.variavel) }))
      .filter((x) => x.caminho && x.variavel)
      .slice(0, 10);
    aplicar({ campos: limpa });
  };
  const textoPendente = (k: string) => typeof dados[k] === "string" && (dados[k] as string).length > 0;
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="webhook-metodo">{t("Método")}</Label>
        <select
          id="webhook-metodo"
          className={SELECT}
          value={c.metodo}
          onChange={(e) => aplicar({ metodo: e.target.value })}
        >
          <option value="POST">{t("POST — envia os dados da conversa")}</option>
          <option value="GET">{t("GET — só consulta o endereço")}</option>
          <option value="PUT">{t("PUT — atualiza um registro")}</option>
          <option value="PATCH">{t("PATCH — atualiza parte de um registro")}</option>
          <option value="DELETE">{t("DELETE — apaga um registro")}</option>
        </select>
      </div>
      <Texto
        id="webhook-url"
        rotulo={t("Endereço (URL)")}
        valor={c.url}
        placeholder="https://"
        onCommit={(v) => aplicar({ url: v.trim() })}
        ajuda={t(
          "Use {{nome}} para pôr uma resposta do contato no endereço, por exemplo https://sualoja.example.com/pedidos/{{pedido}}. Endereço interno da VPS é recusado.",
        )}
      />
      {c.metodo === "POST" || c.metodo === "PUT" || c.metodo === "PATCH" ? (
        <CorpoDoWebhook c={c} aplicar={aplicar} />
      ) : null}
      <CabecalhosDoWebhook c={c} aplicar={aplicar} />
      <div className="space-y-1.5">
        <Label>{t("Guardar da resposta")}</Label>
        {campos.map((x, i) => (
          <div key={`${i}-${campos.length}`} className="flex items-center gap-1.5">
            <Input
              value={x.caminho}
              placeholder="pedido.status"
              aria-label={t("Campo da resposta")}
              onChange={(e) => setCampos(campos.map((y, j) => (j === i ? { ...y, caminho: e.target.value } : y)))}
              onBlur={() => gravar(campos)}
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              value={x.variavel}
              placeholder="status"
              aria-label={t("Guardar em")}
              onChange={(e) => setCampos(campos.map((y, j) => (j === i ? { ...y, variavel: e.target.value } : y)))}
              onBlur={() => gravar(campos)}
            />
            <button
              type="button"
              onClick={() => {
                const nova = campos.filter((_, j) => j !== i);
                setCampos(nova);
                gravar(nova);
              }}
              className="text-muted-foreground hover:text-destructive"
              aria-label={t("Remover campo")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        {campos.length < 10 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCampos([...campos, { caminho: "", variavel: "" }])}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            {t("Adicionar campo")}
          </Button>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {t(
            'Se o sistema responder {"pedido": {"status": "enviado"}}, o campo pedido.status guardado em status vira {{status}} nas mensagens seguintes. O código HTTP fica em {{webhook_status}}.',
          )}
        </p>
      </div>
      <SegredoDoWebhook
        id="webhook-segredo"
        rotulo={t("Segredo de assinatura (opcional)")}
        ajuda={t("Com segredo, cada chamada sai assinada (X-Webhook-Signature), como nas automações.")}
        definido={Boolean(c.segredo_enc)}
        pendente={textoPendente("segredo")}
        aoDigitar={(v) => aplicar({ segredo: v })}
        aoRemover={() => aplicar({ segredo: "", segredo_enc: "" })}
      />
      <SegredoDoWebhook
        id="webhook-autorizacao"
        rotulo={t("Cabeçalho Authorization (opcional)")}
        placeholder="Bearer abc123"
        ajuda={t("Para APIs que pedem chave: o valor vai inteiro no cabeçalho Authorization.")}
        definido={Boolean(c.autorizacao_enc)}
        pendente={textoPendente("autorizacao")}
        aoDigitar={(v) => aplicar({ autorizacao: v })}
        aoRemover={() => aplicar({ autorizacao: "", autorizacao_enc: "" })}
      />
      <p className="text-xs text-muted-foreground">
        {t(
          'No corpo padrão vão o id da conversa, nome, telefone e e-mail do contato, a última mensagem e as respostas guardadas no fluxo. Resposta 2xx segue por "Deu certo"; erro, demora de mais de 8 segundos, corpo inválido ou endereço recusado seguem por "Falhou". Sem ligação em "Falhou", o fluxo termina ali.',
        )}
      </p>
    </>
  );
}

function CorpoDoWebhook({
  c,
  aplicar,
}: {
  c: ConfigDe<"webhook">;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const [corpo, setCorpo] = useState(c.corpo);
  const invalido = c.corpo_modo === "personalizado" && corpo.trim() !== "" && !corpoPersonalizadoValido(corpo);
  return (
    <div className="space-y-1.5">
      <Label htmlFor="webhook-corpo-modo">{t("Corpo da requisição")}</Label>
      <select
        id="webhook-corpo-modo"
        className={SELECT}
        value={c.corpo_modo}
        onChange={(e) => aplicar({ corpo_modo: e.target.value })}
      >
        <option value="padrao">{t("Padrão — os dados da conversa e as respostas")}</option>
        <option value="personalizado">{t("Personalizado — escrevo o JSON")}</option>
      </select>
      {c.corpo_modo === "personalizado" ? (
        <>
          <Textarea
            id="webhook-corpo"
            data-testid="webhook-corpo"
            rows={6}
            maxLength={8000}
            className="font-mono text-xs"
            value={corpo}
            placeholder={'{"nome": "{{nome}}", "telefone": "{{telefone}}"}'}
            onChange={(e) => setCorpo(e.target.value)}
            onBlur={() => corpo !== c.corpo && aplicar({ corpo })}
          />
          {invalido ? (
            <p className="text-xs text-destructive" data-testid="webhook-corpo-invalido">
              {t("Isto não é um JSON válido. Confira aspas, vírgulas e chaves.")}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {t(
              "Use {{nome}} entre aspas para pôr uma resposta do contato — o valor vai escapado, então nada que o contato escreva muda o formato do JSON.",
            )}
          </p>
        </>
      ) : null}
    </div>
  );
}

function CabecalhosDoWebhook({
  c,
  aplicar,
}: {
  c: ConfigDe<"webhook">;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const [lista, setLista] = useState(c.cabecalhos);
  const gravar = (nova: typeof lista) =>
    aplicar({
      cabecalhos: nova
        .map((h) => ({ nome: h.nome.trim().replace(/[^A-Za-z0-9-]/g, "").slice(0, 60), valor: h.valor.slice(0, 500) }))
        .filter((h) => h.nome)
        .slice(0, 10),
    });
  return (
    <div className="space-y-1.5">
      <Label>{t("Cabeçalhos (opcional)")}</Label>
      {lista.map((h, i) => (
        <div key={`${i}-${lista.length}`} className="flex items-center gap-1.5">
          <Input
            value={h.nome}
            placeholder="X-Loja"
            maxLength={60}
            aria-label={t("Nome do cabeçalho")}
            onChange={(e) => setLista(lista.map((y, j) => (j === i ? { ...y, nome: e.target.value } : y)))}
            onBlur={() => gravar(lista)}
          />
          <Input
            value={h.valor}
            placeholder="{{pedido}}"
            maxLength={500}
            aria-label={t("Valor do cabeçalho")}
            onChange={(e) => setLista(lista.map((y, j) => (j === i ? { ...y, valor: e.target.value } : y)))}
            onBlur={() => gravar(lista)}
          />
          <button
            type="button"
            onClick={() => {
              const nova = lista.filter((_, j) => j !== i);
              setLista(nova);
              gravar(nova);
            }}
            className="text-muted-foreground hover:text-destructive"
            aria-label={t("Remover cabeçalho")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {lista.some((h) => h.nome && cabecalhoReservado(h.nome)) ? (
        <p className="text-xs text-destructive">
          {t("Host, Authorization, Cookie, Content-Type e X-Webhook-… são do sistema. Para chave de API use o campo Authorization abaixo.")}
        </p>
      ) : null}
      {lista.length < 10 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLista([...lista, { nome: "", valor: "" }])}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("Adicionar cabeçalho")}
        </Button>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t("Aceita {{nome}} no valor. Não coloque senha aqui: todo mundo da equipe que abre o fluxo vê. Chave vai no Authorization, que fica cifrado.")}
      </p>
    </div>
  );
}

function EsperaDoAtendente({
  dados,
  tipo,
  aplicar,
}: {
  dados: NodeData;
  tipo: "transferir_equipe" | "transferir_atendente";
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const c = lerConfig(tipo, dados);
  const ligada = c.espera_minutos > 0;
  const [minutos, setMinutos] = useState(String(c.espera_minutos || 5));
  const gravarMinutos = () => {
    const n = Math.min(240, Math.max(1, Math.round(Number(minutos) || 5)));
    setMinutos(String(n));
    if (n !== c.espera_minutos) aplicar({ espera_minutos: n });
  };
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={ligada}
          onChange={(e) =>
            aplicar(
              e.target.checked
                ? {
                    espera_minutos: Number(minutos) || 5,
                    espera_mensagem:
                      c.espera_mensagem ||
                      t("Já já alguém da equipe te responde. Obrigado pela paciência!"),
                  }
                : { espera_minutos: 0 },
            )
          }
        />
        <span>
          <span className="font-medium">{t("Mensagem de espera")}</span>
          <span className="block text-xs text-muted-foreground">
            {t("Se ninguém da equipe responder a tempo, o chatbot avisa o contato que a conversa não foi esquecida.")}
          </span>
        </span>
      </label>
      {ligada ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor={`${tipo}-espera-min`}>{t("Mandar depois de (minutos)")}</Label>
            <Input
              id={`${tipo}-espera-min`}
              type="number"
              min={1}
              max={240}
              className="w-24"
              value={minutos}
              onChange={(e) => setMinutos(e.target.value)}
              onBlur={gravarMinutos}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${tipo}-espera-vezes`}>{t("Quantas vezes, no máximo")}</Label>
            <select
              id={`${tipo}-espera-vezes`}
              className={SELECT}
              value={c.espera_vezes}
              onChange={(e) => aplicar({ espera_vezes: Number(e.target.value) })}
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <Texto
            id={`${tipo}-espera-msg`}
            rotulo={t("Mensagem")}
            valor={c.espera_mensagem}
            linhas={3}
            onCommit={(v) => aplicar({ espera_mensagem: v })}
            ajuda={t(
              "Para assim que alguém da equipe responder na conversa (pelo CRM ou pelo celular), ou quando a conversa for fechada.",
            )}
          />
        </>
      ) : null}
    </div>
  );
}

const ROTULO_DO_TIPO_DE_MIDIA: Record<string, string> = {
  image: "Imagem",
  video: "Vídeo",
  audio: "Áudio",
  document: "Documento",
};

function EnviarMidia({
  dados,
  fluxoId,
  biblioteca,
  aplicar,
}: {
  dados: NodeData;
  fluxoId: string;
  biblioteca: MidiaDaBiblioteca[];
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const c = lerConfig("enviar_midia", dados);
  const [subindo, setSubindo] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  // Link curto para mostrar (ou ouvir) o arquivo já escolhido (o bucket é privado).
  useEffect(() => {
    let vivo = true;
    if (!c.storage_path || (c.tipo !== "image" && c.tipo !== "video" && c.tipo !== "audio")) return;
    void fetch(`/api/v1/chatbot-flows/${fluxoId}/media?path=${encodeURIComponent(c.storage_path)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((corpo) => {
        if (vivo) setPrevia(corpo?.data?.url ?? null);
      })
      .catch(() => undefined);
    return () => {
      vivo = false;
    };
  }, [c.storage_path, c.tipo, fluxoId]);

  async function subir(arquivo: File) {
    setSubindo(true);
    try {
      const form = new FormData();
      form.append("file", arquivo);
      const res = await fetch(`/api/v1/chatbot-flows/${fluxoId}/media`, { method: "POST", body: form });
      const corpo = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(corpo?.error?.message ?? t("Não foi possível subir o arquivo."));
        return;
      }
      setPrevia(null);
      aplicar({
        storage_path: corpo.data.storage_path,
        tipo: corpo.data.tipo,
        mime: corpo.data.mime,
        nome_arquivo: corpo.data.nome_arquivo,
      });
    } finally {
      setSubindo(false);
      if (entrada.current) entrada.current.value = "";
    }
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label>{t("Arquivo")}</Label>
        {c.storage_path ? (
          <div className="space-y-2 rounded-lg border border-border p-2">
            {previa && c.tipo === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- link assinado e curto; não passa pelo otimizador
              <img src={previa} alt={c.nome_arquivo} className="max-h-40 w-full rounded-md object-contain" />
            ) : previa && c.tipo === "video" ? (
              <video src={previa} controls className="max-h-40 w-full rounded-md" />
            ) : previa && c.tipo === "audio" ? (
              <audio src={previa} controls className="w-full" data-testid="chatbot-midia-previa-audio" />
            ) : null}
            <p className="flex items-center gap-1.5 text-xs">
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{c.nome_arquivo || t("Arquivo")}</span>
              <span className="ml-auto shrink-0 text-muted-foreground">
                {t(ROTULO_DO_TIPO_DE_MIDIA[c.tipo ?? ""] ?? "Arquivo")}
              </span>
            </p>
          </div>
        ) : null}
        <input
          ref={entrada}
          type="file"
          className="hidden"
          accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void subir(f);
          }}
          data-testid="chatbot-midia-arquivo"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={subindo}
          onClick={() => entrada.current?.click()}
        >
          {subindo ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="mr-1.5 h-3.5 w-3.5" />
          )}
          {c.storage_path ? t("Trocar arquivo") : t("Escolher arquivo")}
        </Button>
        <p className="text-xs text-muted-foreground">
          {t("Foto, vídeo, áudio ou documento (PDF, Word, Excel), até 16 MB.")}
        </p>
      </div>
      {biblioteca.some((m) => m.storage_path !== c.storage_path) ? (
        <div className="space-y-1.5">
          <Label htmlFor="midia-biblioteca">{t("Ou use um arquivo já enviado")}</Label>
          <select
            id="midia-biblioteca"
            className={SELECT}
            value=""
            data-testid="chatbot-midia-biblioteca"
            onChange={(e) => {
              const m = biblioteca.find((x) => x.storage_path === e.target.value);
              if (!m) return;
              setPrevia(null);
              aplicar({
                storage_path: m.storage_path,
                tipo: m.tipo,
                mime: m.mime,
                nome_arquivo: m.nome_arquivo,
              });
            }}
          >
            <option value="">{t("Biblioteca de mídia")}</option>
            {biblioteca
              .filter((m) => m.storage_path !== c.storage_path)
              .map((m) => (
                <option key={m.storage_path} value={m.storage_path}>
                  {`${m.nome_arquivo || t("Arquivo")} · ${t(ROTULO_DO_TIPO_DE_MIDIA[m.tipo] ?? "Arquivo")} · ${m.fluxo}`}
                </option>
              ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {t("Os arquivos que os chatbots da empresa já mandam. Usar um deles não sobe o arquivo outra vez.")}
          </p>
        </div>
      ) : null}
      {c.tipo !== "audio" ? (
        <Texto
          id="midia-legenda"
          rotulo={t("Legenda (opcional)")}
          valor={c.legenda}
          linhas={3}
          onCommit={(v) => aplicar({ legenda: v })}
          ajuda={t('Vai junto com o arquivo. Use {{nome}} para incluir o que o contato respondeu em "Pedir para digitar".')}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("Áudio sai sem legenda no WhatsApp. Se precisar de texto, use um \"Enviar mensagem\" antes.")}
        </p>
      )}
    </>
  );
}

function AgendarHorario({
  dados,
  opcoes,
  aplicar,
  reagendar = false,
}: {
  dados: NodeData;
  opcoes: OpcoesDoPainel;
  aplicar: (p: Record<string, unknown>) => void;
  /** "Reagendar horário": tipo e agenda vêm do compromisso do contato. */
  reagendar?: boolean;
}) {
  const t = useT();
  const c = lerConfig(reagendar ? "reagendar_horario" : "agendar_horario", dados);
  const tipo = opcoes.tiposDeAtendimento.find((x) => x.id === c.event_type_id);
  return (
    <>
      {reagendar ? (
        <p className="text-xs text-muted-foreground">
          {t(
            'O chatbot acha o próximo compromisso do contato e oferece horários livres do mesmo tipo de atendimento e da mesma agenda. Sem compromisso futuro, segue por "Sem agendamento".',
          )}
        </p>
      ) : null}
      <div className={reagendar ? "hidden" : "space-y-1.5"}>
        <Label htmlFor="agenda-tipo">{t("Tipo de atendimento")}</Label>
        <select
          id="agenda-tipo"
          className={SELECT}
          value={c.event_type_id ?? ""}
          onChange={(e) => aplicar({ event_type_id: e.target.value || null })}
        >
          <option value="">{t("Escolha um tipo de atendimento")}</option>
          {opcoes.tiposDeAtendimento.map((x) => (
            <option key={x.id} value={x.id}>
              {x.ativo ? x.nome : `${x.nome} (${t("desativado")})`}
            </option>
          ))}
        </select>
        {opcoes.tiposDeAtendimento.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("Nenhum tipo de atendimento ainda. Crie um em Agenda › Tipos de atendimento.")}
          </p>
        ) : tipo && !tipo.ativo ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            {t('Esse tipo está desativado: o chatbot vai seguir por "Sem horário livre".')}
          </p>
        ) : null}
      </div>
      <div className={reagendar ? "hidden" : "space-y-1.5"}>
        <Label htmlFor="agenda-dono">{t("Agenda de quem")}</Label>
        <select
          id="agenda-dono"
          className={SELECT}
          value={c.owner_user_id ?? ""}
          onChange={(e) => aplicar({ owner_user_id: e.target.value || null })}
        >
          <option value="">{t("O responsável padrão do atendimento")}</option>
          {opcoes.atendentes.map((a) => (
            <option key={a.id} value={a.id}>
              {a.nome}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="agenda-qtd">{t("Horários oferecidos")}</Label>
          <select
            id="agenda-qtd"
            className={SELECT}
            value={c.quantidade}
            onChange={(e) => aplicar({ quantidade: Number(e.target.value) })}
          >
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="agenda-dias">{t("Nos próximos (dias)")}</Label>
          <select
            id="agenda-dias"
            className={SELECT}
            value={c.dias_a_frente}
            onChange={(e) => aplicar({ dias_a_frente: Number(e.target.value) })}
          >
            {[1, 2, 3, 5, 7, 10, 14, 21, 30].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Texto
        id="agenda-pergunta"
        rotulo={t("Pergunta")}
        valor={c.pergunta}
        linhas={2}
        onCommit={(v) => aplicar({ pergunta: v })}
        ajuda={t("Os horários vão numerados embaixo da pergunta, e o contato responde com o número.")}
      />
      <Texto
        id="agenda-confirmacao"
        rotulo={t("Mensagem quando marcar")}
        valor={c.confirmacao}
        linhas={2}
        onCommit={(v) => aplicar({ confirmacao: v })}
        ajuda={t("{{horario}} vira o horário escolhido, por exemplo segunda-feira 27/10 às 14:00.")}
      />
      <Texto
        id="agenda-pendente"
        rotulo={t("Mensagem quando a equipe precisa aprovar")}
        valor={c.confirmacao_pendente}
        linhas={2}
        onCommit={(v) => aplicar({ confirmacao_pendente: v })}
        ajuda={t("Para tipos de atendimento que pedem confirmação da equipe: o horário fica reservado, mas ainda não confirmado.")}
      />
      <Texto
        id="agenda-invalida"
        rotulo={t("Se a resposta não for um dos horários")}
        valor={c.mensagem_invalida}
        linhas={2}
        onCommit={(v) => aplicar({ mensagem_invalida: v })}
      />
      <div className="space-y-1.5">
        <Label htmlFor="agenda-tentativas">{t('Tentativas antes de seguir por "Não escolheu"')}</Label>
        <select
          id="agenda-tentativas"
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
      <PrazoDaResposta id="agenda-prazo" valor={c.prazo_minutos} aplicar={aplicar} />
      <p className="text-xs text-muted-foreground">
        {t(
          'Os horários respeitam a jornada, as folgas, o que já está marcado e a agenda do Google de quem atende — os mesmos que a tela da Agenda mostra. O compromisso aparece na Agenda e no negócio do contato. Sem horário livre (ou agenda não configurada), segue por "Sem horário livre".',
        )}
      </p>
    </>
  );
}

function NegocioNoFunil({
  dados,
  opcoes,
  aplicar,
}: {
  dados: NodeData;
  opcoes: OpcoesDoPainel;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const c = lerConfig("negocio_funil", dados);
  const funil = opcoes.funis.find((f) => f.id === c.pipeline_id);
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="funil-qual">{t("Funil")}</Label>
        <select
          id="funil-qual"
          className={SELECT}
          value={c.pipeline_id ?? ""}
          onChange={(e) =>
            aplicar({ pipeline_id: e.target.value || null, stage_id: null, nome_do_destino: "" })
          }
        >
          <option value="">{t("Escolha um funil")}</option>
          {opcoes.funis.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
      </div>
      {funil ? (
        <div className="space-y-1.5">
          <Label htmlFor="funil-etapa">{t("Etapa")}</Label>
          <select
            id="funil-etapa"
            className={SELECT}
            value={c.stage_id ?? ""}
            onChange={(e) => {
              const etapa = funil.etapas.find((x) => x.id === e.target.value);
              aplicar({
                stage_id: etapa?.id ?? null,
                nome_do_destino: etapa ? `${funil.nome} › ${etapa.nome}` : "",
              });
            }}
          >
            <option value="">{t("Escolha a etapa")}</option>
            {funil.etapas.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <Texto
        id="funil-titulo"
        rotulo={t("Título do negócio novo (opcional)")}
        valor={c.titulo}
        placeholder={t("O nome do contato")}
        onCommit={(v) => aplicar({ titulo: v })}
        ajuda={t('Aceita {{nome}} com o que o contato respondeu, por exemplo "Orçamento — {{servico}}".')}
      />
      <p className="text-xs text-muted-foreground">
        {t(
          "Se o contato já tem um negócio aberto neste funil, ele só muda de etapa. Se o negócio aberto está em outro funil, ele é levado para cá. Se não tem nenhum, um negócio novo nasce nesta etapa.",
        )}
      </p>
    </>
  );
}

function DistribuirFluxo({
  dados,
  aplicar,
}: {
  dados: NodeData;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const c = lerConfig("distribuir_fluxo", dados);
  const [saidas, setSaidas] = useState(c.saidas);
  const gravar = (lista: typeof saidas) =>
    aplicar({
      saidas: lista.map((x) => ({
        rotulo: x.rotulo.trim().slice(0, 40),
        peso: Math.min(100, Math.max(1, Math.round(Number(x.peso) || 1))),
      })),
    });
  const total = saidas.reduce((n, x) => n + (Number(x.peso) || 0), 0) || 1;
  return (
    <div className="space-y-2">
      <Label>{t("Caminhos e pesos")}</Label>
      {saidas.map((x, i) => (
        <div key={`${i}-${saidas.length}`} className="flex items-center gap-1.5">
          <Input
            value={x.rotulo}
            placeholder={String.fromCharCode(65 + i)}
            aria-label={`${t("Nome do caminho")} ${i + 1}`}
            onChange={(e) => setSaidas(saidas.map((y, j) => (j === i ? { ...y, rotulo: e.target.value } : y)))}
            onBlur={() => gravar(saidas)}
          />
          <Input
            type="number"
            min={1}
            max={100}
            className="w-20"
            value={x.peso}
            aria-label={`${t("Peso")} ${i + 1}`}
            onChange={(e) => setSaidas(saidas.map((y, j) => (j === i ? { ...y, peso: Number(e.target.value) } : y)))}
            onBlur={() => gravar(saidas)}
          />
          <span className="w-10 text-right text-xs text-muted-foreground">
            {Math.round(((Number(x.peso) || 0) / total) * 100)}%
          </span>
          <button
            type="button"
            disabled={saidas.length <= 2}
            onClick={() => {
              const nova = saidas.filter((_, j) => j !== i);
              setSaidas(nova);
              gravar(nova);
            }}
            className="text-muted-foreground hover:text-destructive disabled:opacity-30"
            aria-label={t("Remover caminho")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {saidas.length < 6 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const nova = [...saidas, { rotulo: String.fromCharCode(65 + saidas.length), peso: 50 }];
            setSaidas(nova);
            gravar(nova);
          }}
        >
          <Plus className="mr-1 h-3.5 w-3.5" />
          {t("Adicionar caminho")}
        </Button>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t(
          "Cada contato segue por um caminho sorteado pelo peso. Pesos 70 e 30 mandam 70% dos contatos para o primeiro e 30% para o segundo — bom para testar duas mensagens e ver qual vende mais.",
        )}
      </p>
    </div>
  );
}

function ValorDoPasso({
  dados,
  aplicar,
}: {
  dados: NodeData;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const c = lerConfig("valor", dados);
  const semValor = c.operador === "preenchido" || c.operador === "vazio";
  const campoOutro = c.fonte === "campo_contato" && !CAMPOS_FIXOS.includes(c.chave);
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="valor-fonte">{t("Comparar")}</Label>
        <select
          id="valor-fonte"
          className={SELECT}
          value={c.fonte}
          onChange={(e) => {
            const fonte = e.target.value as ConfigDe<"valor">["fonte"];
            aplicar({ fonte, chave: fonte === "campo_contato" ? "nome" : fonte === "variavel" ? c.chave : "" });
          }}
        >
          <option value="variavel">{t("Resposta guardada")}</option>
          <option value="campo_contato">{t("Campo do contato")}</option>
          <option value="mensagem">{t("Última mensagem do contato")}</option>
        </select>
      </div>
      {c.fonte === "variavel" ? (
        <Texto
          id="valor-var"
          rotulo={t("Nome da resposta")}
          valor={c.chave}
          placeholder="total"
          onCommit={(v) => aplicar({ chave: comoChave(v) })}
          ajuda={t(
            'O nome em que a resposta foi guardada: "Pedir para digitar", "Enviar formulário", WebHook ou automação.',
          )}
        />
      ) : null}
      {c.fonte === "campo_contato" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="valor-campo">{t("Campo")}</Label>
            <select
              id="valor-campo"
              className={SELECT}
              value={campoOutro ? "__outro" : c.chave}
              onChange={(e) => aplicar({ chave: e.target.value === "__outro" ? "" : e.target.value })}
            >
              <option value="nome">{t("Nome")}</option>
              <option value="email">{t("E-mail")}</option>
              <option value="aniversario">{t("Aniversário")}</option>
              <option value="__outro">{t("Campo personalizado")}</option>
            </select>
          </div>
          {campoOutro ? (
            <Texto
              id="valor-chave"
              rotulo={t("Nome do campo personalizado")}
              valor={c.chave}
              placeholder="cidade"
              onCommit={(v) => aplicar({ chave: comoChave(v) })}
            />
          ) : null}
        </>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="valor-op">{t("Condição")}</Label>
        <select
          id="valor-op"
          className={SELECT}
          value={c.operador}
          onChange={(e) => aplicar({ operador: e.target.value })}
        >
          <option value="igual">{t("É igual a")}</option>
          <option value="diferente">{t("É diferente de")}</option>
          <option value="contem">{t("Contém")}</option>
          <option value="nao_contem">{t("Não contém")}</option>
          <option value="comeca_com">{t("Começa com")}</option>
          <option value="termina_com">{t("Termina com")}</option>
          <option value="maior">{t("É maior que (número ou data)")}</option>
          <option value="maior_ou_igual">{t("É maior ou igual a (número ou data)")}</option>
          <option value="menor">{t("É menor que (número ou data)")}</option>
          <option value="menor_ou_igual">{t("É menor ou igual a (número ou data)")}</option>
          <option value="preenchido">{t("Está preenchido")}</option>
          <option value="vazio">{t("Está vazio")}</option>
        </select>
      </div>
      {semValor ? null : (
        <Texto
          id="valor-alvo"
          rotulo={t("Valor")}
          valor={c.valor}
          placeholder="100"
          onCommit={(v) => aplicar({ valor: v })}
          ajuda={t(
            "Pode usar {{nome}} para comparar com outra resposta. Maiúsculas e acentos não importam; datas em dd/mm/aaaa.",
          )}
        />
      )}
      <p className="text-xs text-muted-foreground">
        {t('Se valer, segue por "Verdadeiro"; senão, por "Falso".')}
      </p>
    </div>
  );
}

function EnviarTemplate({
  dados,
  opcoes,
  aplicar,
}: {
  dados: NodeData;
  opcoes: OpcoesDoPainel;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const c = lerConfig("enviar_template", dados);
  const escolhido = opcoes.modelos.find((m) => m.id === c.template_id);
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="template">{t("Modelo aprovado")}</Label>
        <select
          id="template"
          className={SELECT}
          value={c.template_id ?? ""}
          onChange={(e) => {
            const m = opcoes.modelos.find((x) => x.id === e.target.value);
            aplicar({ template_id: m?.id ?? null, nome_do_modelo: m ? `${m.nome} (${m.idioma})` : "" });
          }}
        >
          <option value="">{t("Escolha um modelo")}</option>
          {opcoes.modelos.map((m) => (
            <option key={m.id} value={m.id}>
              {`${m.nome} (${m.idioma})`}
            </option>
          ))}
        </select>
      </div>
      {escolhido ? (
        <p className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-xs">
          {escolhido.texto}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {opcoes.modelos.length === 0
          ? t(
              "Nenhum modelo aprovado ainda. Modelos só existem em número oficial da Meta (API do WhatsApp) e são aprovados pela Meta. Modelos com variáveis ficam de fora: o fluxo não tem de onde tirar os valores.",
            )
          : t(
              'O modelo é a única mensagem que o WhatsApp aceita depois de 24 horas sem o contato escrever. Em número conectado por QR Code não há modelo: o fluxo segue por "Não enviado" e a conversa ganha uma nota com o motivo.',
            )}
      </p>
    </>
  );
}

/**
 * "Etiqueta de origem" do Iniciar por um canal: frase da primeira mensagem →
 * etiqueta. Cada linha só vale com os dois campos preenchidos.
 */
function OrigensDoInicio({
  origens,
  aplicar,
}: {
  origens: { frase: string; etiqueta: string }[];
  aplicar: (patch: Record<string, unknown>) => void;
}) {
  const t = useT();
  const [linhas, setLinhas] = useState(origens.length ? origens : []);
  const salvar = (novas: { frase: string; etiqueta: string }[]) => {
    setLinhas(novas);
    aplicar({
      origens: novas
        .map((o) => ({ frase: o.frase.trim(), etiqueta: o.etiqueta.trim() }))
        .filter((o) => o.frase && o.etiqueta),
    });
  };
  const mudar = (i: number, campo: "frase" | "etiqueta", v: string) =>
    setLinhas(linhas.map((o, j) => (j === i ? { ...o, [campo]: v } : o)));
  return (
    <div className="space-y-1.5" data-testid="origens-do-inicio">
      <Label>{t("Etiqueta de origem (opcional)")}</Label>
      <p className="text-xs text-muted-foreground">
        {t(
          "Se a primeira mensagem tiver a frase, o contato ganha a etiqueta. Use a mensagem pronta do seu anúncio ou do link do site para saber de onde ele veio.",
        )}
      </p>
      {linhas.map((o, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <Input
            aria-label={t("Frase")}
            placeholder={t("Ex.: vi no Instagram")}
            value={o.frase}
            onChange={(e) => mudar(i, "frase", e.target.value)}
            onBlur={() => salvar(linhas)}
          />
          <Input
            aria-label={t("Etiqueta")}
            placeholder={t("Ex.: instagram")}
            value={o.etiqueta}
            className="w-32"
            onChange={(e) => mudar(i, "etiqueta", e.target.value)}
            onBlur={() => salvar(linhas)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("Remover")}
            onClick={() => salvar(linhas.filter((_, j) => j !== i))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      {linhas.length < 20 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setLinhas([...linhas, { frase: "", etiqueta: "" }])}
        >
          <Plus className="size-4" />
          {t("Adicionar origem")}
        </Button>
      ) : null}
    </div>
  );
}

/** "Se não responder": o prazo da pergunta, com a saída "Não respondeu a tempo". */
function PrazoDaResposta({
  id,
  valor,
  aplicar,
}: {
  id: string;
  valor: number;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{t("Se o contato não responder")}</Label>
      <select
        id={id}
        className={SELECT}
        value={valor}
        onChange={(e) => aplicar({ prazo_minutos: Number(e.target.value) })}
      >
        {PRAZOS_DE_RESPOSTA.map((m) => (
          <option key={m} value={m}>
            {t(NOMES_DO_PRAZO[m])}
          </option>
        ))}
      </select>
      <p className="text-xs text-muted-foreground">
        {valor > 0
          ? t('Passado o prazo sem resposta, o fluxo segue pela saída "Não respondeu a tempo". Sem nada ligado nela, o fluxo termina.')
          : t("O chatbot espera a resposta pelo tempo que for.")}
      </p>
    </div>
  );
}

const NOMES_DO_PRAZO: Record<(typeof PRAZOS_DE_RESPOSTA)[number], string> = {
  0: "Esperar sem prazo",
  5: "Seguir depois de 5 minutos",
  15: "Seguir depois de 15 minutos",
  30: "Seguir depois de 30 minutos",
  60: "Seguir depois de 1 hora",
  120: "Seguir depois de 2 horas",
  360: "Seguir depois de 6 horas",
  720: "Seguir depois de 12 horas",
  1440: "Seguir depois de 1 dia",
  2880: "Seguir depois de 2 dias",
  10080: "Seguir depois de 7 dias",
};

const NOMES_DO_FORMATO_DE_RESPOSTA: Record<FormatoDeResposta, string> = {
  qualquer: "Qualquer texto",
  email: "E-mail",
  telefone: "Telefone",
  cpf: "CPF",
  cnpj: "CNPJ",
  numero: "Número",
  data: "Data (dd/mm/aaaa)",
  hora: "Hora (hh:mm)",
};

const NOMES_DO_MODO_DE_ATENDENTE: Record<ModoDeAtendente, string> = {
  especifico: "Um atendente específico",
  rodizio: "Rodízio entre a equipe",
  menos_conversas: "Quem tem menos conversas abertas",
  anterior: "Quem atendeu o contato antes",
  anterior_mesma_conversa: "Quem atendeu esta conversa antes",
  variavel: "O atendente de uma variável",
  remover: "Remover o atendente da conversa",
};

const EXPLICACAO_DO_MODO_DE_ATENDENTE: Record<ModoDeAtendente, string> = {
  especifico: "A conversa vai sempre para a mesma pessoa, mesmo que ela esteja fora do ar.",
  rodizio:
    "Cada conversa vai para um atendente disponível, um de cada vez: recebe primeiro quem está há mais tempo sem receber. Se ninguém estiver disponível, ela vai para a fila da equipe.",
  menos_conversas:
    "A conversa vai para o atendente disponível com menos conversas abertas no momento. Se ninguém estiver disponível, ela vai para a fila da equipe.",
  anterior:
    "A conversa volta para quem atendeu este contato da última vez neste número. Se não houver ninguém, ela vai para a fila da equipe.",
  anterior_mesma_conversa:
    "A conversa volta para o último atendente desta mesma conversa. Se não houver ninguém, ela vai para a fila da equipe.",
  variavel:
    "A conversa vai para o atendente cujo id ou e-mail está na variável (por exemplo, vindo de um WebHook). Se não for alguém da equipe, ela vai para a fila.",
  remover:
    "Tira o atendente da conversa, que fica sem dono, e o fluxo continua no próximo passo.",
};

const NOMES_DO_TIPO_DE_RESPOSTA: Record<PerguntaDoFormulario["tipo"], string> = {
  texto: "Texto livre",
  email: "E-mail",
  numero: "Número",
  data: "Data (dd/mm/aaaa)",
  telefone: "Telefone",
  cpf: "CPF",
  cnpj: "CNPJ",
  hora: "Hora (hh:mm)",
};

function EnviarFormulario({
  dados,
  aplicar,
}: {
  dados: NodeData;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const c = lerConfig("enviar_formulario", dados);
  const mudarPergunta = (i: number, parcial: Partial<PerguntaDoFormulario>) =>
    aplicar({
      perguntas: c.perguntas.map((q, j) => (j === i ? { ...q, ...parcial } : q)),
    });
  return (
    <>
      <Texto
        id="form-intro"
        rotulo={t("Mensagem de abertura (opcional)")}
        valor={c.introducao}
        linhas={2}
        placeholder={t("Ex.: Para seguir, preciso de alguns dados.")}
        onCommit={(v) => aplicar({ introducao: v })}
      />
      {c.perguntas.map((q, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">
              {t("Pergunta")} {i + 1}
            </span>
            <button
              type="button"
              className="text-muted-foreground hover:text-destructive disabled:opacity-40"
              disabled={c.perguntas.length === 1}
              aria-label={t("Remover pergunta")}
              onClick={() => aplicar({ perguntas: c.perguntas.filter((_, j) => j !== i) })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          <Texto
            key={`p-${i}-${c.perguntas.length}`}
            id={`form-p-${i}`}
            rotulo={t("Pergunta")}
            valor={q.pergunta}
            linhas={2}
            onCommit={(v) => mudarPergunta(i, { pergunta: v })}
          />
          <div className="space-y-1.5">
            <Label htmlFor={`form-tipo-${i}`}>{t("Tipo de resposta")}</Label>
            <select
              id={`form-tipo-${i}`}
              className={SELECT}
              value={q.tipo}
              onChange={(e) => mudarPergunta(i, { tipo: e.target.value as PerguntaDoFormulario["tipo"] })}
            >
              {(Object.keys(NOMES_DO_TIPO_DE_RESPOSTA) as PerguntaDoFormulario["tipo"][]).map((k) => (
                <option key={k} value={k}>
                  {t(NOMES_DO_TIPO_DE_RESPOSTA[k])}
                </option>
              ))}
            </select>
          </div>
          <Texto
            key={`v-${i}-${c.perguntas.length}`}
            id={`form-var-${i}`}
            rotulo={t("Guardar a resposta em")}
            valor={q.variavel}
            onCommit={(v) => mudarPergunta(i, { variavel: comoChave(v) || `resposta_${i + 1}` })}
          />
          <div className="space-y-1.5">
            <Label htmlFor={`form-gravar-${i}`}>{t("Gravar também no contato")}</Label>
            <select
              id={`form-gravar-${i}`}
              className={SELECT}
              value={q.gravar_em}
              onChange={(e) =>
                mudarPergunta(i, { gravar_em: e.target.value as PerguntaDoFormulario["gravar_em"] })
              }
            >
              <option value="">{t("Não gravar")}</option>
              <option value="nome">{t("Nome")}</option>
              <option value="email">{t("E-mail")}</option>
              <option value="aniversario">{t("Aniversário")}</option>
            </select>
          </div>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={c.perguntas.length >= 10}
        onClick={() =>
          aplicar({
            perguntas: [
              ...c.perguntas,
              perguntaDoFormularioSchema.parse({
                pergunta: "",
                variavel: `resposta_${c.perguntas.length + 1}`,
              }),
            ],
          })
        }
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        {t("Adicionar pergunta")}
      </Button>
      <Texto
        id="form-invalida"
        rotulo={t("Se a resposta não servir")}
        valor={c.mensagem_invalida}
        linhas={2}
        onCommit={(v) => aplicar({ mensagem_invalida: v })}
      />
      <div className="space-y-1.5">
        <Label htmlFor="form-tentativas">{t("Tentativas por pergunta")}</Label>
        <select
          id="form-tentativas"
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
      <PrazoDaResposta id="form-prazo" valor={c.prazo_minutos} aplicar={aplicar} />
      {c.prazo_minutos > 0 ? (
        <p className="-mt-2 text-xs text-muted-foreground">
          {t("O prazo vale para cada pergunta: recomeça quando a próxima sai.")}
        </p>
      ) : null}
      <Texto
        id="form-fim"
        rotulo={t("Mensagem ao terminar (opcional)")}
        valor={c.conclusao}
        linhas={2}
        placeholder={t("Ex.: Obrigado, {{nome}}! Já anotei tudo.")}
        onCommit={(v) => aplicar({ conclusao: v })}
      />
      <p className="text-xs text-muted-foreground">
        {t(
          'As perguntas saem uma de cada vez, e cada resposta é conferida pelo tipo. Use as respostas depois como {{nome_que_você_escolheu}}. Se o contato errar todas as tentativas de uma pergunta, segue por "Não respondeu certo".',
        )}
      </p>
    </>
  );
}
