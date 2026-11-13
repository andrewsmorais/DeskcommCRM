"use client";
/**
 * Como encerrar o atendimento, dentro da confirmação do Fechar — o "Finalizar"
 * da Umbler Talk: só encerrar, mandar uma despedida antes, ou acionar um
 * chatbot de encerramento (a pesquisa de satisfação, por exemplo).
 *
 * A última despedida escrita fica lembrada NESTE navegador (conveniência de
 * quem atende, não dado da empresa): `localStorage`, com try/catch, porque
 * aba anônima ou bloqueio de dados do site fazem a leitura lançar.
 */
import { useT } from "@/hooks/i18n/useT";
import { Label } from "@/components/ui/label";
import { useChatbotsManuais } from "@/hooks/inbox/useChatbotManual";

export type EscolhaDoEncerramento =
  | { tipo: "nenhum" }
  | { tipo: "mensagem"; texto: string }
  | { tipo: "chatbot"; chatbot_flow_id: string };

const CHAVE_DA_DESPEDIDA = "chataionline.despedida";

export function despedidaLembrada(): string {
  try {
    return window.localStorage.getItem(CHAVE_DA_DESPEDIDA) ?? "";
  } catch {
    return "";
  }
}
export function lembrarDespedida(texto: string): void {
  try {
    window.localStorage.setItem(CHAVE_DA_DESPEDIDA, texto);
  } catch {
    // Sem armazenamento no navegador: a próxima despedida começa vazia.
  }
}

const SELECT =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/** As três saídas do Fechar, na ordem da tela. */
const TIPOS = ["nenhum", "mensagem", "chatbot"] as const;

/**
 * A escolha com que a janela abre, segundo Configurações › Conversas: se a
 * empresa só permite uma saída, ela já vem escolhida e preenchida.
 */
export function escolhaInicial(
  permitidas: ReadonlyArray<EscolhaDoEncerramento["tipo"]>,
  despedidaPadrao: string,
  chatbotPadrao: string | null,
): EscolhaDoEncerramento {
  if (permitidas.length === 1 && permitidas[0] === "mensagem")
    return { tipo: "mensagem", texto: despedidaPadrao || despedidaLembrada() };
  if (permitidas.length === 1 && permitidas[0] === "chatbot")
    return { tipo: "chatbot", chatbot_flow_id: chatbotPadrao ?? "" };
  return { tipo: "nenhum" };
}

export function EncerramentoDoFechar(props: {
  valor: EscolhaDoEncerramento;
  onChange: (v: EscolhaDoEncerramento) => void;
  /** O que a empresa permite (Configurações › Conversas); padrão: as três. */
  permitidas?: ReadonlyArray<EscolhaDoEncerramento["tipo"]>;
  /** A despedida sugerida: a do perfil, senão a da empresa. */
  despedidaPadrao?: string;
  chatbotPadrao?: string | null;
}) {
  const t = useT();
  const { data: chatbots } = useChatbotsManuais();
  const { valor, onChange } = props;
  const permitidas = props.permitidas ?? TIPOS;
  // Uma saída só: não há o que escolher, então não há botão de opção.
  const unica = permitidas.length === 1;
  const opcao = (tipo: EscolhaDoEncerramento["tipo"], rotulo: string) =>
    !permitidas.includes(tipo) || unica ? null : (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="radio"
        name="encerramento"
        checked={valor.tipo === tipo}
        data-testid={`encerramento-${tipo}`}
        onChange={() =>
          onChange(
            tipo === "mensagem"
              ? { tipo, texto: props.despedidaPadrao || despedidaLembrada() }
              : tipo === "chatbot"
                ? { tipo, chatbot_flow_id: props.chatbotPadrao ?? "" }
                : { tipo: "nenhum" },
          )
        }
      />
      {rotulo}
    </label>
    );
  return (
    <div className="space-y-2" data-testid="encerramento-do-fechar">
      {unica && permitidas[0] === "mensagem" ? (
        <p className="text-sm font-medium">{t("Antes de fechar, sai esta despedida:")}</p>
      ) : null}
      {unica && permitidas[0] === "chatbot" ? (
        <p className="text-sm font-medium">{t("A conversa é encerrada por este chatbot:")}</p>
      ) : null}
      {opcao(TIPOS[0], t("Só encerrar"))}
      {opcao(TIPOS[1], t("Enviar uma mensagem de despedida antes"))}
      {valor.tipo === "mensagem" ? (
        <div className={unica ? "space-y-1" : "space-y-1 pl-6"}>
          <Label htmlFor="despedida" className="sr-only">
            {t("Mensagem de despedida")}
          </Label>
          <textarea
            id="despedida"
            rows={3}
            maxLength={4096}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
            placeholder={t("Ex.: Obrigado pelo contato! Qualquer coisa, é só chamar.")}
            value={valor.texto}
            onChange={(e) => onChange({ tipo: "mensagem", texto: e.target.value })}
          />
        </div>
      ) : null}
      {opcao(TIPOS[2], t("Acionar um chatbot de encerramento"))}
      {valor.tipo === "chatbot" ? (
        <div className={unica ? "space-y-1" : "space-y-1 pl-6"}>
          <select
            aria-label={t("Chatbot de encerramento")}
            className={SELECT}
            value={valor.chatbot_flow_id}
            onChange={(e) => onChange({ tipo: "chatbot", chatbot_flow_id: e.target.value })}
          >
            <option value="">{t("Escolha…")}</option>
            {(chatbots ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            {t(
              'A conversa continua aberta até o chatbot chegar ao passo "Finalizar conversa", que encerra o atendimento.',
            )}
          </p>
        </div>
      ) : null}
    </div>
  );
}
