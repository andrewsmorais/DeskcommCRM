"use client";

/**
 * "Pessoas relacionadas" do negócio: outros números do MESMO cliente (o
 * comprador que fala de outro WhatsApp, o fixo da loja). Trazido do produto
 * original; os vínculos moram em `crm_lead_links` (`target_kind='contact'`,
 * `link_kind='related'`), sem tabela nova.
 */
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useContactList } from "@/hooks/contacts/useContactList";
import { useT } from "@/hooks/i18n/useT";
import { useContatosRelacionados } from "@/hooks/leads/useContatosRelacionados";
import { ApiError } from "@/lib/api/types";
import {
  useAdicionarParticipante,
  useAdicionarPeloTelefone,
  useRemoverParticipante,
} from "@/hooks/leads/useParticipantesDoNegocio";
import type { ContatoRelacionado } from "@/app/api/v1/leads/[id]/contatos-relacionados/route";
import { nomeDoContato } from "@/lib/contacts/rotulo-do-contato";

/**
 * As outras pessoas do negócio: a lista que faltava embaixo do contato
 * principal (#1506 F1), e o ESCRITOR que faltava desde então (#3083 F1).
 *
 * ─── O DEFEITO QUE ESTE BLOCO FECHA ─────────────────────────────────────────
 *
 * Até aqui a lista só sabia LER. Não existia `INSERT` em `crm_lead_links` com
 * `target_kind='contact'` em lugar nenhum do produto — nem rota, nem tela —,
 * então não havia como adicionar, remover nem dar papel a um participante. O
 * único caminho era editar a descrição do negócio à mão.
 *
 * ─── POR QUE A LISTA VAZIA NÃO SOME MAIS ────────────────────────────────────
 *
 * A versão leitora devolvia `null` com a lista vazia, de propósito: negócio sem
 * relacionado não ganhava um título de seção pendurado no dossiê, e quem
 * carregava a tela não via um piscar de lista vazia antes da resposta. Com o
 * escritor isso deixou de servir: se a lista vazia some, ela leva junto o ÚNICO
 * controle que ADICIONA a primeira pessoa — o recurso novo ficaria inalcançável
 * justo nos negócios que mais precisam dele. Agora a seção aparece vazia,
 * dizendo que está vazia, com o controle ao lado.
 *
 * O carregamento continua mudo (`isLoading` devolve `null`): isso não é a lista
 * vazia, é a resposta que ainda não chegou — e um "nenhuma pessoa" que pisca
 * antes dos dados é uma afirmação falsa sobre o negócio. O erro NÃO some: ele é
 * a única coisa que a pessoa tem a ler quando a rota falha.
 *
 * Sem `leadId` não há âncora para escrever: o bloco inteiro não renderiza, e
 * quem monta o componente sem o negócio (card, testes do dossiê) não faz rede.
 *
 * O `papel` vem do `metadata` escrito pelo atendente (texto livre, teto de 40 —
 * a régua está na rota) e o nome vem do cadastro: dado de quem usou o produto,
 * não frase de interface, então os dois saem como vieram em qualquer idioma.
 */
export function PessoasRelacionadas({ leadId }: { leadId: string | null }) {
  const t = useT();
  const { data, isLoading, isError } = useContatosRelacionados(leadId);
  if (!leadId) return null;
  if (isError) {
    return (
      <p className="mt-2 text-xs text-destructive">
        {t("Não consegui carregar as pessoas relacionadas.")}
      </p>
    );
  }
  if (isLoading) return null;
  const pessoas = data?.data ?? [];
  return (
    <div className="mt-3 space-y-1" data-testid="pessoas-relacionadas">
      <p className="text-[11px] font-medium tracking-wide text-text-muted uppercase">
        {t("Pessoas relacionadas")}
      </p>
      {pessoas.length === 0 ? (
        <p className="text-xs text-text-muted">{t("Nenhuma pessoa relacionada ainda.")}</p>
      ) : (
        <ul className="space-y-1">
          {pessoas.map((pessoa) => (
            <li key={pessoa.contact_id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="min-w-0 truncate">{pessoa.nome ?? "—"}</span>
              {pessoa.papel && <span className="text-text-muted">({pessoa.papel})</span>}
              {pessoa.anonimizado && <span className="text-text-muted">{t("Anonimizado")}</span>}
              {pessoa.telefone && (
                <span className="text-text-muted tabular-nums">{pessoa.telefone}</span>
              )}
              {pessoa.conversa_id && (
                <Link
                  href={`/app/inbox?id=${pessoa.conversa_id}`}
                  aria-label={`${t("Abrir conversa com")} ${pessoa.nome ?? pessoa.telefone ?? ""}`.trim()}
                  className="text-accent underline-offset-2 hover:underline"
                >
                  {t("Conversa")}
                </Link>
              )}
              <RemoverParticipante leadId={leadId} pessoa={pessoa} />
            </li>
          ))}
        </ul>
      )}
      <AdicionarParticipante leadId={leadId} />
      <AdicionarPeloTelefone leadId={leadId} />
    </div>
  );
}

/**
 * "+ telefone" (#3669, fatia 1): o cliente B2B fala por vários números — o
 * dono, o comprador, o fixo da loja — e cada número é um contato com a própria
 * conversa. Ligar o número ao negócio põe a pessoa na lista acima; a partir daí
 * a mensagem dela não abre outro card (`fn_nascer_lead_da_conversa`, 9045) e a
 * ligação dela cai neste negócio (`emitAgentActivityForContact`).
 *
 * Mesmo desenho do "Adicionar participante": fechado por padrão, e é a
 * montagem do formulário que permite a escrita. A diferença é a porta de
 * entrada: aqui a vendedora tem o NÚMERO, não um contato já cadastrado para
 * buscar — o número que aparece no identificador de chamadas, o que o cliente
 * passou por mensagem.
 */
function AdicionarPeloTelefone({ leadId }: { leadId: string }) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  if (aberto) {
    return <FormularioDoTelefone leadId={leadId} onFechar={() => setAberto(false)} />;
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-xs text-text-muted hover:text-text"
      data-testid="adicionar-pelo-telefone"
      onClick={() => setAberto(true)}
    >
      {t("+ telefone")}
    </Button>
  );
}

function FormularioDoTelefone({ leadId, onFechar }: { leadId: string; onFechar: () => void }) {
  const t = useT();
  const [telefone, setTelefone] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState("");
  const ligar = useAdicionarPeloTelefone(leadId);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (!telefone.trim()) {
      toast.error(t("Digite o telefone."));
      return;
    }
    try {
      const r = await ligar.mutateAsync({
        telefone: telefone.trim(),
        nome: nome.trim() || null,
        papel: papel.trim() || null,
      });
      toast.success(
        r.jaExistia
          ? t("O contato que já tinha este número foi ligado ao negócio.")
          : t("Telefone ligado ao negócio."),
      );
      onFechar();
    } catch {
      // `useAdicionarPeloTelefone` já mostra o erro da API (telefone inválido,
      // contato principal, sem permissão); aqui só não deixar a rejeição
      // escapar como erro não tratado.
    }
  }

  return (
    <form
      onSubmit={salvar}
      className="space-y-2 rounded-md border border-border p-2"
      data-testid="formulario-do-telefone"
    >
      <div className="space-y-1">
        <Label htmlFor="telefone-da-pessoa" className="text-xs">
          {t("Telefone")}
        </Label>
        <Input
          id="telefone-da-pessoa"
          type="tel"
          inputMode="tel"
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="nome-da-pessoa" className="text-xs">
          {t("Nome (opcional)")}
        </Label>
        <Input id="nome-da-pessoa" value={nome} onChange={(e) => setNome(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label htmlFor="papel-do-telefone" className="text-xs">
          {t("Papel")}
        </Label>
        <Input
          id="papel-do-telefone"
          value={papel}
          maxLength={40}
          placeholder={t("Comprador, loja…")}
          onChange={(e) => setPapel(e.target.value)}
        />
      </div>
      <div className="flex gap-1">
        <Button type="submit" size="sm" className="h-7 px-2 text-xs" disabled={ligar.isPending}>
          {ligar.isPending ? t("Ligando…") : t("Ligar ao negócio")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px] text-text-muted"
          onClick={onFechar}
        >
          {t("Cancelar")}
        </Button>
      </div>
    </form>
  );
}

/**
 * O "remover" de UMA pessoa.
 *
 * Componente próprio, e não um botão inline, porque o hook de mutação é por
 * LINHA: montado dentro do `<li>`, cada linha tem o seu estado de "removendo" e
 * só o botão clicado desabilita. Um hook de remoção só para a lista inteira
 * desabilitaria todos os botões ao remover qualquer um.
 */
function RemoverParticipante({ leadId, pessoa }: { leadId: string; pessoa: ContatoRelacionado }) {
  const t = useT();
  const remover = useRemoverParticipante(leadId);
  // O nome no rótulo acessível: numa lista de pessoas, "Remover" sozinho não diz
  // a quem o botão pertence.
  const alvo = pessoa.nome ?? "";
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="ml-auto h-6 px-2 text-[11px] text-text-muted hover:text-destructive"
      disabled={remover.isPending}
      aria-label={`${t("Remover")} ${alvo}`.trim()}
      onClick={() =>
        remover.mutate(pessoa.contact_id, {
          onSuccess: () => toast.success(t("Participante removido.")),
        })
      }
    >
      {t("Remover")}
    </Button>
  );
}

/**
 * O controle que ADICIONA a primeira pessoa — e todas as outras.
 *
 * Fechado por padrão: o dossiê é uma leitura na maior parte do tempo, e um
 * formulário de busca sempre aberto ocuparia o rodapé de todos os negócios.
 * Aberto, ele MONTA `FormularioDeParticipante` — e é a montagem que segura a
 * única chamada de rede (`useContactList` não tem `enabled`): fechado, não há
 * requisição nenhuma de contatos.
 */
function AdicionarParticipante({ leadId }: { leadId: string }) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  if (aberto) {
    return <FormularioDeParticipante leadId={leadId} onFechar={() => setAberto(false)} />;
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-xs text-text-muted hover:text-text"
      data-testid="adicionar-participante"
      onClick={() => setAberto(true)}
    >
      {t("Adicionar participante")}
    </Button>
  );
}

/**
 * A busca e o papel, e o POST.
 *
 * O papel é digitado ANTES de escolher a pessoa (texto livre, teto de 40 no
 * servidor) porque é ele que faz o vínculo ser útil: "quem paga" e "quem viaja"
 * são a informação que o negócio de grupo precisa, e escrevê-la depois exigiria
 * abrir a linha de novo. Em branco, o vínculo nasce sem papel — e um POST novo
 * do mesmo contato com papel preenchido é "dar papel", que é o mesmo caminho
 * (upsert no índice único, do lado do servidor).
 */
function FormularioDeParticipante({ leadId, onFechar }: { leadId: string; onFechar: () => void }) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const [papel, setPapel] = useState("");
  const adicionar = useAdicionarParticipante(leadId);
  const termo = busca.trim();
  const { data, isLoading } = useContactList({ search: termo || undefined, limit: 5 });
  const contatos = data?.pages[0]?.data ?? [];

  async function incluir(contactId: string) {
    try {
      await adicionar.mutateAsync({ contact_id: contactId, papel: papel.trim() || null });
      toast.success(t("Participante adicionado."));
      onFechar();
    } catch {
      // `useAdicionarParticipante` já mostra o erro da API; aqui só não deixar a
      // rejeição escapar como erro não tratado.
    }
  }

  return (
    <div
      className="space-y-2 rounded-md border border-border p-2"
      data-testid="formulario-de-participante"
    >
      <div className="space-y-1">
        <Label htmlFor="papel-do-participante" className="text-xs">
          {t("Papel")}
        </Label>
        <Input
          id="papel-do-participante"
          value={papel}
          maxLength={40}
          placeholder={t("Pagante, passageiro…")}
          onChange={(e) => setPapel(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="busca-de-participante" className="text-xs">
          {t("Buscar contato")}
        </Label>
        <Input
          id="busca-de-participante"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>
      {isLoading && <p className="text-[11px] text-text-muted">{t("Carregando…")}</p>}
      {!isLoading && contatos.length === 0 && (
        <p className="text-[11px] text-text-muted">{t("Nenhum contato encontrado.")}</p>
      )}
      <ul className="space-y-1">
        {contatos.map((contato) => (
          <li key={contato.id} className="flex items-center gap-2 text-xs">
            <span className="min-w-0 truncate">{nomeDoContato(contato) ?? "—"}</span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="ml-auto h-6 px-2 text-[11px]"
              disabled={adicionar.isPending}
              onClick={() => incluir(contato.id)}
            >
              {t("Adicionar")}
            </Button>
          </li>
        ))}
      </ul>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-[11px] text-text-muted"
        onClick={onFechar}
      >
        {t("Cancelar")}
      </Button>
    </div>
  );
}
