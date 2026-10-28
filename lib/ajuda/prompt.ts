/**
 * O prompt do assistente de ajuda — montado do CÓDIGO, não escrito à mão.
 *
 * ── Por que ele acompanha o CRM sozinho ─────────────────────────────────────
 *
 * Três fontes, e só uma é texto escrito:
 *   1. As telas (nome, descrição, grupo, papel mínimo, módulo) saem do
 *      `NAV_CATALOG` — o mesmo array que desenha o menu. Tela renomeada ou nova
 *      chega ao assistente no mesmo commit.
 *   2. Planos, limites e recursos saem de `lib/billing/catalogo.ts` — o mesmo
 *      catálogo que libera e bloqueia na tela. O assistente não tem como
 *      prometer um número que o CRM não cumpre.
 *   3. O "como usar" de cada tela mora em `lib/ajuda/manual/`, e
 *      `tests/unit/ajuda-manual-cobre-todas-as-telas.test.ts` reprova tela do
 *      catálogo sem entrada (e entrada de tela que não existe mais).
 *
 * ── Duas metades, por causa do cache ────────────────────────────────────────
 *
 * `parteFixa` é igual para todo cliente da instalação (manual inteiro + planos)
 * e vai com `cache_control`: a Anthropic cobra ~10% dela a partir da segunda
 * mensagem. `parteDoCliente` é curta e muda por pessoa: plano, papel e QUAIS
 * telas ela enxerga — o assistente não ensina caminho para tela que o menu dela
 * não mostra.
 */
import {
  LIMITES_DO_PLANO,
  PLANOS_COMERCIAIS,
  RECURSOS_DO_PLANO,
  type LimiteDoPlano,
  type PlanoComercial,
} from "@/lib/billing/catalogo";
import { NAV_CATALOG, NAV_GROUPS, type NavMetadata } from "@/lib/navigation/catalogo";
import { GUIAS, MANUAL } from "@/lib/ajuda/manual";

/** Marcador que o modelo escreve quando o caso precisa de uma pessoa. */
export const MARCA_DE_ESCALAR = "[ESCALAR]";

const ROTULO_DO_PAPEL: Record<string, string> = {
  viewer: "Leitor (só vê)",
  agent: "Atendente",
  manager: "Gerente",
  admin: "Administrador",
};

const ROTULO_DO_LIMITE: Record<LimiteDoPlano, string> = {
  whatsapp: "números de WhatsApp",
  pipelines: "funis",
  agentes_ia: "agentes de IA",
  chatbots: "chatbots ligados",
  usuarios: "usuários",
};

const PLANOS: PlanoComercial[] = (Object.keys(PLANOS_COMERCIAIS) as PlanoComercial[]).sort(
  (a, b) => PLANOS_COMERCIAIS[a].ordem - PLANOS_COMERCIAIS[b].ordem,
);

function tabelaDePlanos(): string {
  const linhas = PLANOS.map((p) => {
    const plano = PLANOS_COMERCIAIS[p];
    const limites = LIMITES_DO_PLANO.map((l) => `${plano[l]} ${ROTULO_DO_LIMITE[l]}`).join(", ");
    const desde = Object.values(RECURSOS_DO_PLANO)
      .filter((r) => r.desde === p)
      .map((r) => r.nome);
    const extra = desde.length ? ` Libera a partir dele: ${desde.join("; ")}.` : "";
    const escala =
      p === "escala" ? " (números a partir destes; o valor final sai da proposta)" : "";
    return `- ${plano.nome}: ${limites}${escala}.${extra}`;
  });
  return [
    "Cada plano inclui tudo do plano anterior.",
    ...linhas,
    "Não cite preços: eles estão na página de planos do site. Se perguntarem, diga onde ver.",
  ].join("\n");
}

function blocoDaTela(d: NavMetadata): string {
  const m = MANUAL[d.href];
  const partes = [`### ${d.label} (${d.href})`, d.description];
  if (m) {
    partes.push(m.oQueE);
    partes.push("Como usar:\n" + m.comoUsar.map((p, i) => `${i + 1}. ${p}`).join("\n"));
    if (m.cuidados?.length) partes.push("Cuidados:\n" + m.cuidados.map((c) => `- ${c}`).join("\n"));
  }
  return partes.join("\n");
}

function manualCompleto(): string {
  return NAV_GROUPS.map((g) => {
    const telas = (NAV_CATALOG as readonly NavMetadata[]).filter((d) => d.group === g.id);
    return `## Grupo do menu: ${g.label}\n\n${telas.map(blocoDaTela).join("\n\n")}`;
  }).join("\n\n");
}

export type ContextoDoCliente = {
  marca: string;
  /** Plano contratado, ou `null` sem assinatura reconhecida. */
  plano: PlanoComercial | null;
  /** `trialing`, `active`, … — como está na assinatura. */
  status: string | null;
  /** Limites que valem para esta organização (o Escala pode ter os da proposta). */
  limites: Record<LimiteDoPlano, number> | null;
  papel: string | null;
  /** As telas que o menu DESTA pessoa mostra. */
  telasVisiveis: readonly Pick<NavMetadata, "href" | "label">[];
  contato: { email: string; whatsapp: string };
};

export function parteFixa(marca: string): string {
  return `Você é o assistente de ajuda do ${marca}, um CRM com agentes de IA e chatbots para atendimento e vendas pelo WhatsApp. Quem fala com você é cliente do ${marca}: dono de pequeno negócio ou alguém da equipe dele, quase sempre sem conhecimento técnico.

Responda SEMPRE em português do Brasil.

# Como você atende

- Seja cordial, direto e paciente. Respostas curtas (até 3 parágrafos curtos ou uma lista de passos), a menos que a pessoa peça um texto maior, como um prompt.
- Quando a pergunta for "como faço", dê o passo a passo com o caminho no menu e os nomes dos botões entre aspas, exatamente como estão no manual abaixo.
- Use SÓ o que está neste manual e na seção "Sobre este cliente". Nunca invente tela, botão, recurso, limite, prazo ou preço. Se não estiver aqui, diga que não tem certeza e ofereça o contato da equipe.
- Você não acessa os dados da conta da pessoa e não faz alterações por ela: você explica como ela faz. Nunca peça senha, código de verificação, chave de API ou número de cartão.
- Se a pessoa mandar um print da tela, leia o que aparece nele e responda a partir disso.
- Se o recurso perguntado não está no plano dela, diga com gentileza a partir de qual plano ele existe, sem empurrar venda.
- Se a tela perguntada não aparece no menu dela, explique o motivo provável (papel na equipe, plano ou recurso desligado na instalação) em vez de ensinar o caminho.

# Ajudar a escrever o prompt de um agente

Você pode e deve escrever junto com a pessoa o prompt (as instruções) de um agente de IA. Use o guia "Como escrever o prompt (as instruções) do agente de IA" abaixo: faça poucas perguntas sobre o negócio (o que vende, para quem, tom de voz, horários, o que nunca prometer, quando passar para uma pessoa) e entregue um texto pronto para colar, dentro de um bloco de texto. Lembre que preço, endereço e horário ficam melhor na base de Conhecimento do que no prompt.

# Quando chamar uma pessoa

Escreva ${MARCA_DE_ESCALAR} sozinho na última linha quando o caso for: cobrança, pagamento ou reembolso; erro ou falha que precise de investigação; problema na conta que você não pode ver; número de WhatsApp bloqueado; pedido de mudança de plano Escala; ou quando a pessoa pedir para falar com alguém. Nesses casos diga que a equipe responde pelos contatos que aparecem na tela de ajuda. Não use ${MARCA_DE_ESCALAR} em dúvidas de uso que você conseguiu responder.

# Planos

${tabelaDePlanos()}

# Guias

${GUIAS.map((g) => `## ${g.titulo}\n\n${g.conteudo}`).join("\n\n")}

# Manual das telas

As telas abaixo são TODAS as que o produto tem. Cada pessoa vê só parte delas, conforme a seção "Sobre este cliente".

${manualCompleto()}`;
}

export function parteDoCliente(c: ContextoDoCliente): string {
  const plano = c.plano ? PLANOS_COMERCIAIS[c.plano].nome : "sem plano ativo reconhecido";
  const situacao =
    c.status === "trialing"
      ? " (em teste grátis)"
      : c.status === "active"
        ? ""
        : c.status
          ? ` (situação: ${c.status})`
          : "";
  const limites = c.limites
    ? LIMITES_DO_PLANO.map((l) => `${c.limites![l]} ${ROTULO_DO_LIMITE[l]}`).join(", ")
    : "não disponível";
  const contatos =
    [
      c.contato.whatsapp ? `WhatsApp +${c.contato.whatsapp}` : "",
      c.contato.email ? `e-mail ${c.contato.email}` : "",
    ]
      .filter(Boolean)
      .join(" e ") || "os contatos da tela de ajuda";
  return `# Sobre este cliente

- Plano: ${plano}${situacao}.
- Limites que valem para a conta dele: ${limites}.
- Papel na equipe: ${c.papel ? (ROTULO_DO_PAPEL[c.papel] ?? c.papel) : "desconhecido"}.
- Telas que aparecem no menu dele: ${c.telasVisiveis.map((t) => `${t.label} (${t.href})`).join("; ") || "nenhuma"}.
- Contato da equipe para casos que você não resolve: ${contatos}.`;
}
