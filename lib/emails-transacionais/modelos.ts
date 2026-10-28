/**
 * Os cinco e-mails de relacionamento do produto, em PT-BR, sem React Email.
 * Devolvem `subject`/`html`/`text`. Estilo inline apenas (compatibilidade com
 * cliente de e-mail) e zero asset externo, como `lib/email/templates/invite.ts`.
 *
 *   1. boas-vindas   — a pessoa confirmou o cadastro (e-mail ou Google);
 *   2. plano ativo   — o plano foi contratado;
 *   3. plano melhor  — subiu de plano;
 *   4. plano menor   — desceu de plano;
 *   5. reembolso     — o estorno foi confirmado.
 *
 * ── De onde saem os números ─────────────────────────────────────────────────
 *
 * Quantidades vêm de `PLANOS_COMERCIAIS` (`lib/billing/catalogo.ts`), a MESMA
 * tabela que o CRM usa para barrar e que a página de vendas promete. O texto é
 * escrito à mão, mas nenhum número é digitado aqui: um e-mail que diz "4
 * números" para um plano que o CRM limita a 3 seria promessa quebrada por
 * escrito. `modelos.test.ts` confere os números contra o catálogo.
 *
 * ── A marca ─────────────────────────────────────────────────────────────────
 *
 * Entra resolvida (`marcaDaSaida`), como em todo e-mail do produto: o nome,
 * o logo e a cor são os da instalação, nunca digitados aqui.
 *
 * O Escala fica de fora de propósito: ele é ativado pelo dono da plataforma
 * depois de uma conversa, com números combinados, e ainda não tem e-mail.
 */
import {
  PLANOS_COMERCIAIS,
  RECURSOS_DO_PLANO,
  type LimiteDoPlano,
  type PlanoComercial,
  planoInclui,
} from "@/lib/billing/catalogo";
import { NEUTROS_DE_SAIDA, type MarcaDeSaida } from "@/lib/branding/saida";

/** Os planos que têm e-mail. O Escala é combinado à mão e não entra. */
export type PlanoComEmail = Exclude<PlanoComercial, "escala">;

export type EmailMontado = { subject: string; html: string; text: string };

export type CicloDeCobranca = "monthly" | "quarterly" | "yearly";

export type FormaDePagamento = "PIX" | "CREDIT_CARD" | "BOLETO";

const ROTULO_DO_CICLO: Record<CicloDeCobranca, string> = {
  monthly: "mensal",
  quarterly: "trimestral",
  yearly: "anual",
};

/** O que a pessoa lê sobre o que cada limite conta. */
const ROTULO_DO_LIMITE: Record<LimiteDoPlano, (n: number) => string> = {
  whatsapp: (n) => `${n} números de WhatsApp`,
  agentes_ia: (n) => (n === 1 ? "1 agente de IA, para atender e vender" : `${n} agentes de IA`),
  chatbots: (n) => (n === 1 ? "1 chatbot, para respostas rápidas e o suporte" : `${n} chatbots`),
  pipelines: (n) => `${n} funis de vendas`,
  usuarios: (n) => `${n} usuários na equipe`,
};

/** A ordem em que os limites aparecem, igual à dos cards da página de vendas. */
const ORDEM_DOS_LIMITES: readonly LimiteDoPlano[] = [
  "whatsapp",
  "agentes_ia",
  "chatbots",
  "pipelines",
  "usuarios",
];

/**
 * O que cada plano ACRESCENTA além dos números, escrito para quem não é técnico.
 * Cada linha aponta o recurso do catálogo que a sustenta: se o recurso mudar de
 * plano, `modelos.test.ts` reprova e o texto não fica afirmando o que o CRM não
 * entrega.
 */
const DESTAQUES: ReadonlyArray<{
  texto: string;
  recurso: keyof typeof RECURSOS_DO_PLANO;
}> = [
  { texto: "Agendamentos", recurso: "agendamentos" },
  {
    texto: "Chatbot avançado: webhook, condições, espera e distribuição",
    recurso: "chatbot_avancado",
  },
  { texto: "Follow-up automático, que chama de volta quem sumiu", recurso: "follow_up" },
  { texto: "Agente que organiza o CRM sozinho", recurso: "organizar_crm" },
  { texto: "Comandas e propostas", recurso: "comandas_e_propostas" },
  { texto: "Relatórios completos", recurso: "relatorios_completos" },
];

export function destaquesDoPlano(plano: PlanoComEmail): string[] {
  return DESTAQUES.filter((d) => planoInclui(plano, d.recurso)).map((d) => d.texto);
}

export function limitesDoPlano(plano: PlanoComEmail): string[] {
  const base = PLANOS_COMERCIAIS[plano];
  return ORDEM_DOS_LIMITES.map((chave) => ROTULO_DO_LIMITE[chave](base[chave]));
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatarReais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

/** Um bloco do corpo. O mesmo dado vira HTML e texto puro, sem duas verdades. */
type Bloco =
  | { tipo: "p"; texto: string }
  | { tipo: "forte"; texto: string }
  | { tipo: "lista"; itens: string[] }
  | { tipo: "resumo"; titulo: string; linhas: [string, string][] }
  | { tipo: "botao"; rotulo: string; url: string };

type Corpo = {
  assunto: string;
  titulo: string;
  blocos: Bloco[];
};

function renderizar(marca: MarcaDeSaida, corpo: Corpo): EmailMontado {
  const logo = marca.logoUrl
    ? `<p style="margin:0 0 24px"><img src="${escapeHtml(marca.logoUrl)}" alt="${escapeHtml(marca.nome)}" height="40" style="height:40px;width:auto;max-width:200px;border:0;display:block"></p>`
    : "";

  const html = corpo.blocos
    .map((b) => {
      switch (b.tipo) {
        case "p":
          return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6">${escapeHtml(b.texto)}</p>`;
        case "forte":
          return `<p style="margin:0 0 16px;font-size:15px;line-height:1.6"><strong>${escapeHtml(b.texto)}</strong></p>`;
        case "lista":
          return `<ul style="margin:0 0 16px;padding-left:20px;font-size:15px;line-height:1.7">${b.itens
            .map((i) => `<li>${escapeHtml(i)}</li>`)
            .join("")}</ul>`;
        case "resumo":
          return `<div style="margin:0 0 20px;padding:14px 16px;border:1px solid ${NEUTROS_DE_SAIDA.linha};border-radius:8px;font-size:14px;line-height:1.7"><div style="font-weight:600;margin-bottom:4px">${escapeHtml(b.titulo)}</div>${b.linhas
            .map(([k, v]) => `${escapeHtml(k)}: <strong>${escapeHtml(v)}</strong>`)
            .join("<br>")}</div>`;
        case "botao":
          return `<p style="margin:24px 0"><a href="${escapeHtml(b.url)}" style="display:inline-block;padding:12px 24px;background:${marca.accent};color:${marca.accentFg};border-radius:6px;text-decoration:none;font-weight:600">${escapeHtml(b.rotulo)}</a></p>`;
      }
    })
    .join("\n    ");

  const emHtml = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:${NEUTROS_DE_SAIDA.fundo};font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:${NEUTROS_DE_SAIDA.texto}">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    ${logo}
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;color:${NEUTROS_DE_SAIDA.texto}">${escapeHtml(corpo.titulo)}</h1>
    ${html}
  </div>
</body>
</html>`;

  const text = [
    corpo.titulo,
    "",
    ...corpo.blocos.map((b) => {
      switch (b.tipo) {
        case "p":
        case "forte":
          return b.texto;
        case "lista":
          return b.itens.map((i) => `- ${i}`).join("\n");
        case "resumo":
          return [b.titulo, ...b.linhas.map(([k, v]) => `${k}: ${v}`)].join("\n");
        case "botao":
          return `${b.rotulo}: ${b.url}`;
      }
    }),
  ].join("\n\n");

  return { subject: corpo.assunto, html: emHtml, text };
}

function saudacao(nome: string | null): string {
  return nome ? `Oi, ${nome}!` : "Oi!";
}

function assinatura(marca: MarcaDeSaida): Bloco {
  return { tipo: "p", texto: `Equipe ${marca.nome}` };
}

// ── 1. Boas-vindas ──────────────────────────────────────────────────────────

export type ContextoDasBoasVindas = {
  marca: MarcaDeSaida;
  nome: string | null;
  /** A organização já tem uma assinatura em teste (veio pela página de vendas). */
  emTeste: boolean;
  urlDoApp: string;
};

export function montarBoasVindas(ctx: ContextoDasBoasVindas): EmailMontado {
  const { marca } = ctx;
  return renderizar(marca, {
    assunto: `Bem-vindo ao ${marca.nome}${ctx.nome ? `, ${ctx.nome}` : ""} 👋`,
    titulo: `Bem-vindo ao ${marca.nome}${ctx.nome ? `, ${ctx.nome}` : ""}`,
    blocos: [
      { tipo: "p", texto: saudacao(ctx.nome) },
      {
        tipo: "p",
        texto:
          "Que bom ter você com a gente. A partir de agora, o seu WhatsApp tem um time trabalhando junto com você: agentes de IA e chatbots que atendem, respondem dúvidas, agendam e levam o cliente até a venda, a qualquer hora, inclusive enquanto você dorme.",
      },
      {
        tipo: "p",
        texto:
          "E você não precisa ser técnico para nada disso. Em poucos minutos dá para deixar tudo rodando:",
      },
      {
        tipo: "p",
        texto:
          "1. Conecte o seu WhatsApp. É só ler um QR code com o celular, igual ao WhatsApp Web. O seu número continua seu, no seu aparelho.",
      },
      {
        tipo: "p",
        texto:
          "2. Crie o seu primeiro agente de IA ou chatbot. O agente conversa de forma natural: você conta como é o seu negócio, o que vende e como gosta de atender, e ele aprende o seu jeito. O chatbot segue um fluxo que você desenha, com menus e respostas prontas, ótimo para o suporte e para as perguntas que se repetem. Dá para usar os dois juntos.",
      },
      {
        tipo: "p",
        texto:
          "3. Teste antes de ligar. Use o botão Testar para conversar com o agente ou com o chatbot e ajuste o que quiser. Você só liga para os clientes quando estiver satisfeito.",
      },
      {
        tipo: "p",
        texto: ctx.emTeste
          ? "Você tem 7 dias grátis para conhecer tudo com calma. Nesse tempo, nenhuma cobrança."
          : "Escolha o seu plano para começar. Todos têm 7 dias grátis para você conhecer tudo com calma.",
      },
      { tipo: "botao", rotulo: `Entrar no ${marca.nome}`, url: `${ctx.urlDoApp}/app` },
      {
        tipo: "p",
        texto:
          "Se travar em qualquer passo, é só responder este e-mail. Quem lê é gente de verdade, e a gente te ajuda.",
      },
      { tipo: "p", texto: "Um abraço," },
      assinatura(marca),
    ],
  });
}

// ── 2. Plano contratado ─────────────────────────────────────────────────────

export type ResumoDaAssinatura = {
  ciclo: CicloDeCobranca | null;
  valorEmCentavos: number | null;
  proximaCobranca: Date | null;
};

function linhasDoResumo(plano: PlanoComEmail, r: ResumoDaAssinatura): [string, string][] {
  const linhas: [string, string][] = [
    ["Plano", `${PLANOS_COMERCIAIS[plano].nome}${r.ciclo ? ` (${ROTULO_DO_CICLO[r.ciclo]})` : ""}`],
  ];
  if (r.valorEmCentavos !== null) linhas.push(["Valor", formatarReais(r.valorEmCentavos)]);
  if (r.proximaCobranca) linhas.push(["Próxima cobrança", formatarData(r.proximaCobranca)]);
  return linhas;
}

export type ContextoDoPlano = {
  marca: MarcaDeSaida;
  nome: string | null;
  plano: PlanoComEmail;
  resumo: ResumoDaAssinatura;
  urlDoApp: string;
};

export function montarPlanoContratado(ctx: ContextoDoPlano): EmailMontado {
  const { marca, plano } = ctx;
  const nomeDoPlano = PLANOS_COMERCIAIS[plano].nome;
  return renderizar(marca, {
    assunto: `Obrigado pela confiança${ctx.nome ? `, ${ctx.nome}` : ""}! Seu plano ${nomeDoPlano} está ativo`,
    titulo: `Seu plano ${nomeDoPlano} está ativo`,
    blocos: [
      { tipo: "p", texto: saudacao(ctx.nome) },
      {
        tipo: "p",
        texto: `Obrigado por escolher o ${marca.nome}. Sabemos que confiar o atendimento do seu negócio a uma ferramenta nova é uma decisão importante, e queremos que valha cada centavo.`,
      },
      {
        tipo: "p",
        texto: `Seu plano ${nomeDoPlano} já está ativo. Veja o que ele libera para você:`,
      },
      { tipo: "lista", itens: [...limitesDoPlano(plano), ...destaquesDoPlano(plano)] },
      {
        tipo: "p",
        texto:
          "Uma dica para começar bem: deixe um número com o agente de IA, focado em vender, e outro com o chatbot, focado em suporte e nas perguntas que se repetem. Assim cada cliente cai no lugar certo desde a primeira mensagem.",
      },
      {
        tipo: "resumo",
        titulo: "Resumo da sua assinatura",
        linhas: linhasDoResumo(plano, ctx.resumo),
      },
      {
        tipo: "p",
        texto:
          "E fique tranquilo: se nos primeiros 7 dias você sentir que não é para você, devolvemos 100% do valor, sem precisar explicar o motivo.",
      },
      { tipo: "botao", rotulo: "Abrir o meu CRM", url: `${ctx.urlDoApp}/app` },
      { tipo: "p", texto: "Conte com a gente," },
      assinatura(marca),
    ],
  });
}

// ── 3 e 4. Mudança de plano ─────────────────────────────────────────────────

export type ContextoDaMudanca = ContextoDoPlano & { anterior: PlanoComEmail };

/** "De 2 para 4 números de WhatsApp" para cada limite que cresceu. */
function limitesQueCresceram(de: PlanoComEmail, para: PlanoComEmail): string[] {
  const a = PLANOS_COMERCIAIS[de];
  const b = PLANOS_COMERCIAIS[para];
  const nome: Record<LimiteDoPlano, string> = {
    whatsapp: "números de WhatsApp",
    agentes_ia: "agentes de IA",
    chatbots: "chatbots",
    pipelines: "funis",
    usuarios: "usuários",
  };
  return ORDEM_DOS_LIMITES.filter((k) => b[k] > a[k]).map(
    (k) => `De ${a[k]} para ${b[k]} ${nome[k]}`,
  );
}

function destaquesNovos(de: PlanoComEmail, para: PlanoComEmail): string[] {
  return DESTAQUES.filter((d) => planoInclui(para, d.recurso) && !planoInclui(de, d.recurso)).map(
    (d) => d.texto,
  );
}

function destaquesPerdidos(de: PlanoComEmail, para: PlanoComEmail): string[] {
  return destaquesNovos(para, de);
}

export function montarPlanoMelhorado(ctx: ContextoDaMudanca): EmailMontado {
  const { marca, plano } = ctx;
  const nomeDoPlano = PLANOS_COMERCIAIS[plano].nome;
  const ganhos = [
    ...limitesQueCresceram(ctx.anterior, plano),
    ...destaquesNovos(ctx.anterior, plano),
  ];
  return renderizar(marca, {
    assunto: `Você subiu para o ${nomeDoPlano}! Veja o que acabou de liberar 🚀`,
    titulo: `Você subiu para o ${nomeDoPlano}`,
    blocos: [
      { tipo: "p", texto: saudacao(ctx.nome) },
      {
        tipo: "p",
        texto: `Que notícia boa: o seu negócio está crescendo, e o ${marca.nome} cresceu junto. Seu plano agora é o ${nomeDoPlano}, e tudo já está liberado, sem precisar fazer nada.`,
      },
      { tipo: "forte", texto: "O que você ganhou:" },
      { tipo: "lista", itens: ganhos },
      {
        tipo: "p",
        texto:
          "Por onde começar: que tal ligar o follow-up automático? Ele chama de volta quem perguntou o preço e sumiu, e costuma ser o recurso que mais recupera venda. Com mais agentes e chatbots, você também pode dedicar cada um a um número e a um tipo de conversa.",
      },
      { tipo: "resumo", titulo: "Sua assinatura agora", linhas: linhasDoResumo(plano, ctx.resumo) },
      { tipo: "botao", rotulo: "Explorar os novos recursos", url: `${ctx.urlDoApp}/app` },
      { tipo: "p", texto: "Obrigado por continuar com a gente," },
      assinatura(marca),
    ],
  });
}

export function montarPlanoReduzido(ctx: ContextoDaMudanca): EmailMontado {
  const { marca, plano } = ctx;
  const nomeDoPlano = PLANOS_COMERCIAIS[plano].nome;
  const perdidos = destaquesPerdidos(ctx.anterior, plano);
  return renderizar(marca, {
    assunto: `Seu plano mudou para ${nomeDoPlano}, e está tudo certo`,
    titulo: `Seu plano mudou para ${nomeDoPlano}`,
    blocos: [
      { tipo: "p", texto: saudacao(ctx.nome) },
      {
        tipo: "p",
        texto: `Recebemos a mudança do seu plano para o ${nomeDoPlano}. Cada negócio tem o seu momento, e o importante é o ${marca.nome} caber direitinho no seu.`,
      },
      {
        tipo: "forte",
        texto:
          "Primeiro, o mais importante: você não perde nada. Seus contatos, conversas, funis, agentes, chatbots e usuários continuam exatamente onde estão. Nada é apagado.",
      },
      { tipo: "forte", texto: `O que muda daqui para frente: o ${nomeDoPlano} permite` },
      { tipo: "lista", itens: limitesDoPlano(plano) },
      {
        tipo: "p",
        texto:
          "Se hoje você tem mais do que isso, tudo continua funcionando. Você só não consegue criar mais agentes, chatbots, funis, números ou usuários até ficar dentro do limite.",
      },
      ...(perdidos.length > 0
        ? ([
            {
              tipo: "p",
              texto: "Estes recursos deixam de estar disponíveis para criar novos fluxos:",
            },
            { tipo: "lista", itens: perdidos },
          ] as Bloco[])
        : []),
      { tipo: "resumo", titulo: "Sua assinatura agora", linhas: linhasDoResumo(plano, ctx.resumo) },
      {
        tipo: "p",
        texto:
          "E quando quiser voltar a crescer, é um clique: tudo o que você já construiu estará esperando por você.",
      },
      { tipo: "botao", rotulo: "Ver o meu plano", url: `${ctx.urlDoApp}/app/settings/billing` },
      { tipo: "p", texto: "Qualquer dúvida, é só responder este e-mail." },
      assinatura(marca),
    ],
  });
}

// ── 6. Escala ativado ───────────────────────────────────────────────────────

/**
 * O que só o Escala tem. Cada linha aponta o recurso do catálogo:
 * `modelos.test.ts` reprova se algum deixar de ser exclusivo do Escala.
 */
export const EXCLUSIVOS_DO_ESCALA: ReadonlyArray<{
  texto: string;
  recurso: keyof typeof RECURSOS_DO_PLANO;
}> = [
  { texto: "Distribuição de leads por número e por time", recurso: "distribuicao_avancada" },
  { texto: "Permissões avançadas para a sua equipe", recurso: "permissoes_avancadas" },
  { texto: "Logs e auditoria de tudo o que acontece no CRM", recurso: "auditoria" },
  { texto: "Integrações avançadas para os agentes de IA", recurso: "integracoes_avancadas" },
  { texto: "Marca própria", recurso: "multimarca" },
];

export type ContextoDoEscala = {
  marca: MarcaDeSaida;
  nome: string | null;
  /** Os números da proposta (`limitesEfetivos("escala", …)`), nunca o pacote base cru. */
  limites: Record<LimiteDoPlano, number>;
  urlDoApp: string;
  /** Contatos da instalação; vazio = a linha não aparece. */
  contato: { email: string; whatsapp: string };
};

/** "5512981667389" → "(12) 98166-7389"; outros formatos voltam com "+". */
function whatsappLegivel(d: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${d}`;
}

export function montarEscalaAtivo(ctx: ContextoDoEscala): EmailMontado {
  const { marca, limites } = ctx;
  const plural = (n: number, um: string, varios: string) =>
    n === 1 ? `1 ${um}` : `${n} ${varios}`;
  const contatos: string[] = [];
  if (ctx.contato.whatsapp) {
    contatos.push(
      `WhatsApp: ${whatsappLegivel(ctx.contato.whatsapp)} (https://wa.me/${ctx.contato.whatsapp})`,
    );
  }
  if (ctx.contato.email) contatos.push(`E-mail: ${ctx.contato.email}`);

  return renderizar(marca, {
    assunto: `${ctx.nome ? `${ctx.nome}, o` : "O"} seu Escala está no ar 🚀`,
    titulo: "Seu plano Escala está ativo",
    blocos: [
      { tipo: "p", texto: saudacao(ctx.nome) },
      {
        tipo: "p",
        texto:
          "Que alegria ter você no Escala ❤️ Conversamos, montamos juntos a proposta, e agora está tudo liberado na sua conta, do jeito que combinamos.",
      },
      { tipo: "forte", texto: "O que você tem a partir de hoje" },
      {
        tipo: "lista",
        itens: [
          plural(limites.whatsapp, "número de WhatsApp", "números de WhatsApp"),
          `${plural(limites.agentes_ia, "agente de IA", "agentes de IA")} e ${plural(limites.chatbots, "chatbot", "chatbots")}, trabalhando juntos no atendimento`,
          plural(limites.pipelines, "funil de vendas", "funis de vendas"),
          plural(limites.usuarios, "usuário na equipe", "usuários na equipe"),
        ],
      },
      { tipo: "forte", texto: "O que só o Escala tem" },
      { tipo: "lista", itens: EXCLUSIVOS_DO_ESCALA.map((e) => e.texto) },
      {
        tipo: "p",
        texto:
          "Tudo o que já existia no Impulso continua aqui: campanhas, follow-up automático, agente que organiza o CRM, API, webhooks e relatórios completos.",
      },
      {
        tipo: "p",
        texto:
          "Se a operação crescer e precisar de mais números, agentes, chatbots ou pessoas, é só falar com a gente que ajustamos a proposta.",
      },
      ...(contatos.length > 0 ? [{ tipo: "lista" as const, itens: contatos }] : []),
      { tipo: "botao", rotulo: `Abrir o ${marca.nome}`, url: `${ctx.urlDoApp}/app` },
      { tipo: "p", texto: "Um abraço, e vamos escalar juntos 🚀" },
      assinatura(marca),
    ],
  });
}

// ── 5. Reembolso ────────────────────────────────────────────────────────────

export type ContextoDoReembolso = {
  marca: MarcaDeSaida;
  nome: string | null;
  valorEmCentavos: number | null;
  forma: FormaDePagamento | null;
};

/** Os prazos são os da página de reembolso do site, seção 3. */
const PRAZO_DA_FORMA: Record<FormaDePagamento, string> = {
  PIX: "Pix: na mesma conta de origem, em até 2 dias úteis.",
  CREDIT_CARD:
    "Cartão de crédito: pedimos o estorno à operadora em até 3 dias úteis. A partir daí, quem decide a data é o seu cartão. Normalmente aparece na fatura atual ou na seguinte, o que pode levar de 30 a 60 dias.",
  BOLETO:
    "Boleto: devolvemos por Pix ou transferência para uma conta no seu nome, em até 5 dias úteis depois de recebermos os dados bancários.",
};

export function montarReembolso(ctx: ContextoDoReembolso): EmailMontado {
  const { marca } = ctx;
  const valor = ctx.valorEmCentavos !== null ? formatarReais(ctx.valorEmCentavos) : null;
  const formas: FormaDePagamento[] = ctx.forma ? [ctx.forma] : ["PIX", "CREDIT_CARD", "BOLETO"];
  const boleto = formas.includes("BOLETO");
  return renderizar(marca, {
    assunto: `Seu reembolso está confirmado${ctx.nome ? `, ${ctx.nome}` : ""}. Pode ficar tranquilo 💜`,
    titulo: "Seu reembolso está confirmado",
    blocos: [
      { tipo: "p", texto: saudacao(ctx.nome) },
      {
        tipo: "p",
        texto: `Seu pedido de reembolso foi confirmado, e ${valor ? `o valor de ${valor}` : "o valor pago"} vai voltar para você. Sem letra miúda e sem burocracia. Foi isso que prometemos, e é isso que estamos fazendo.`,
      },
      { tipo: "forte", texto: "Quando o dinheiro cai:" },
      { tipo: "lista", itens: formas.map((f) => PRAZO_DA_FORMA[f]) },
      ...(boleto
        ? ([
            {
              tipo: "p",
              texto:
                "Para o boleto, responda este e-mail com os dados de uma conta no seu nome para fazermos a devolução.",
            },
          ] as Bloco[])
        : []),
      {
        tipo: "p",
        texto:
          "Se algo não sair como descrito acima, responda este e-mail que a gente resolve pessoalmente. Atendemos de segunda a sexta, das 9h às 18h.",
      },
      {
        tipo: "p",
        texto:
          "Sentimos muito que desta vez não tenha dado certo, de verdade. Se puder nos contar em uma linha o que faltou, isso nos ajuda muito a melhorar.",
      },
      {
        tipo: "p",
        texto: `E as portas ficam abertas. Quando quiser voltar, o ${marca.nome} vai estar aqui.`,
      },
      { tipo: "p", texto: "Com carinho," },
      assinatura(marca),
    ],
  });
}
