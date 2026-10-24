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
  metaDoPasso,
  regraSchema,
  type Regra,
} from "@/lib/chatbot/passos";

import { IconeDoPasso } from "./icones";
import type { NodeData } from "./node-types";

export type OpcoesDoPainel = {
  canais: { id: string; nome: string }[];
  atendentes: { id: string; nome: string }[];
  /** Follow-ups publicados (os roteiros de atendimento ficam de fora). */
  followups: { id: string; nome: string }[];
  /** O fluxo aberto no editor (para subir arquivo e para "Acionar outro fluxo"). */
  fluxoAtual: string;
  fluxos: { id: string; nome: string; ligado: boolean }[];
  /** Tipos de atendimento da Agenda. */
  tiposDeAtendimento: { id: string; nome: string; ativo: boolean }[];
  funis: { id: string; nome: string; etapas: { id: string; nome: string }[] }[];
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
      return (
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
      );
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
            {(["alguma", "todas"] as const).map((m) => (
              <label key={m} className="flex items-center gap-2 text-sm">
                <input type="radio" name="etq-modo" checked={c.modo === m} onChange={() => aplicar({ modo: m })} />
                {m === "alguma" ? t("Qualquer uma delas") : t("Todas elas")}
              </label>
            ))}
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
              "A conversa vai para a fila de atendentes e fica como Aguardando até alguém pegar. A Distribuição de atendimento escolhe quem pega.",
            )}
          </p>
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
          <EsperaDoAtendente dados={dados} tipo="transferir_atendente" aplicar={aplicar} />
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
      );
    }
    case "aguardar_intervalo":
      return <AguardarIntervalo dados={dados} aplicar={aplicar} />;
    case "webhook":
      return <WebhookDoChatbot dados={dados} aplicar={aplicar} />;
    case "iniciar_followup": {
      const c = lerConfig("iniciar_followup", dados);
      return (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="followup">{t("Follow-up")}</Label>
            <select
              id="followup"
              className={SELECT}
              value={c.pointer_id ?? ""}
              onChange={(e) => aplicar({ pointer_id: e.target.value || null })}
            >
              <option value="">{t("Escolha um follow-up")}</option>
              {opcoes.followups.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            {opcoes.followups.length === 0
              ? t("Nenhum follow-up publicado ainda. Crie e publique um em IA › Follow-ups.")
              : t(
                  "O contato entra no follow-up como se o agente de IA o tivesse armado. Se ele já estiver em outro follow-up ativo, fica no que está — e a conversa ganha uma nota dizendo isso.",
                )}
          </p>
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
            <Label htmlFor="ate-hora">{t("Horário")}</Label>
            <Input
              id="ate-hora"
              type="time"
              value={c.hora}
              onChange={(e) => e.target.value && aplicar({ hora: e.target.value })}
            />
          </div>
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
          </div>
          <SeResponder valor={c.se_responder} aplicar={aplicar} />
        </>
      );
    }
    case "enviar_midia":
      return <EnviarMidia dados={dados} fluxoId={opcoes.fluxoAtual} aplicar={aplicar} />;
    case "agendar_horario":
      return <AgendarHorario dados={dados} opcoes={opcoes} aplicar={aplicar} />;
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
}: {
  id: string;
  regra: Regra;
  onChange: (r: Regra) => void;
}) {
  const t = useT();
  const mudar = (parcial: Partial<Regra>) => onChange({ ...regra, ...parcial });
  const etiqueta = regra.fonte === "etiqueta";
  const semValor = regra.operador === "preenchido" || regra.operador === "vazio";
  const campoOutro = regra.fonte === "campo_contato" && !CAMPOS_FIXOS.includes(regra.chave);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
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
          <option value="etiqueta">{t("Etiqueta do contato")}</option>
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
          'No POST vão o id da conversa, nome, telefone e e-mail do contato, a última mensagem e as respostas guardadas no fluxo. Resposta 2xx segue por "Deu certo"; erro, demora de mais de 8 segundos ou endereço recusado seguem por "Falhou". Sem ligação em "Falhou", o fluxo termina ali.',
        )}
      </p>
    </>
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
  aplicar,
}: {
  dados: NodeData;
  fluxoId: string;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const c = lerConfig("enviar_midia", dados);
  const [subindo, setSubindo] = useState(false);
  const [previa, setPrevia] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  // Link curto para mostrar a imagem/vídeo já escolhido (o bucket é privado).
  useEffect(() => {
    let vivo = true;
    if (!c.storage_path || (c.tipo !== "image" && c.tipo !== "video")) return;
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
}: {
  dados: NodeData;
  opcoes: OpcoesDoPainel;
  aplicar: (p: Record<string, unknown>) => void;
}) {
  const t = useT();
  const c = lerConfig("agendar_horario", dados);
  const tipo = opcoes.tiposDeAtendimento.find((x) => x.id === c.event_type_id);
  return (
    <>
      <div className="space-y-1.5">
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
      <div className="space-y-1.5">
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
