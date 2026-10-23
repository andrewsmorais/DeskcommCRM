import { describe, expect, it } from "vitest";

import {
  CHAVE_DOS_HORARIOS,
  continuarAposMarcar,
  continuarComHorarios,
  continuarFluxo,
  iniciarFluxo,
  inicioParaAcionar,
  proximaMensagemDeEspera,
  respostasVisiveis,
  type ContextoDoTurno,
  type OfertaDeHorario,
} from "./motor";
import { caminhoDoChatbotDaOrg } from "./midia";
import { escolherOfertas } from "./ofertas";
import { saidasDoPasso, type Grafo } from "./passos";
import {
  comecarPorAutomacao,
  comecarTeste,
  enviarNoTeste,
  horariosDeExemplo,
  pularEspera,
  responderWebhookNoTeste,
} from "./simulador";
import { problemasDoGrafo } from "./validar";

const no = (id: string, type: string, data: Record<string, unknown> = {}) => ({
  id,
  type,
  position: { x: 0, y: 0 },
  data,
});
const liga = (source: string, target: string, sourceHandle: string | null = "proximo") => ({
  id: `${source}-${sourceHandle}-${target}`,
  source,
  target,
  sourceHandle,
});
// Quarta-feira, 22/10/2026, 10:30 em São Paulo (13:30 UTC).
const AGORA = "2026-10-22T13:30:00Z";
const ctx = (mensagem: string | null): ContextoDoTurno => ({
  mensagem,
  agora: new Date(AGORA),
  fuso: "America/Sao_Paulo",
});
const textos = (efeitos: { tipo: string; texto?: string }[]) =>
  efeitos.filter((e) => e.tipo === "enviar").map((e) => e.texto);

const FLUXO = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";
const TIPO = "33333333-3333-4333-8333-333333333333";
const FUNIL = "44444444-4444-4444-8444-444444444444";
const ETAPA = "55555555-5555-4555-8555-555555555555";
const ORG = "66666666-6666-4666-8666-666666666666";

const OFERTAS: OfertaDeHorario[] = [
  { inicio: "2026-10-23T12:00:00.000Z", quando: "sexta-feira 23/10 às 09:00" },
  { inicio: "2026-10-23T17:00:00.000Z", quando: "sexta-feira 23/10 às 14:00" },
];

describe("Acionar outro fluxo", () => {
  const g: Grafo = {
    nodes: [
      no("ini", "inicio_canal"),
      no("nome", "pedir_digitar", { pergunta: "Seu nome?", variavel: "nome" }),
      no("vai", "acionar_fluxo", { flow_id: OUTRO, nome_do_fluxo: "Vendas" }),
    ],
    edges: [liga("ini", "nome"), liga("nome", "vai")],
  };

  it("encerra este fluxo e pede ao executor o outro, levando as respostas", () => {
    const r1 = iniciarFluxo(g, "ini", ctx("oi"));
    const r2 = continuarFluxo(g, r1.sessao, ctx("Ana"));
    expect(r2.sessao).toMatchObject({ status: "completed", no_atual: null });
    expect(r2.sessao.dados.nome).toBe("Ana");
    expect(r2.pendente).toEqual({ tipo: "fluxo", no: "vai", flow_id: OUTRO });
  });

  it("sem fluxo escolhido só termina — e não liga", () => {
    const sem: Grafo = { nodes: [no("ini", "inicio_canal"), no("vai", "acionar_fluxo")], edges: [liga("ini", "vai")] };
    const r = iniciarFluxo(sem, "ini", ctx("oi"));
    expect(r.pendente).toBeUndefined();
    expect(r.sessao.status).toBe("completed");
    expect(problemasDoGrafo(sem)).toContain('escolha o fluxo do passo "Acionar outro fluxo".');
    expect(saidasDoPasso("acionar_fluxo", {})).toEqual([]);
  });

  it("o fluxo chamado começa por 'Iniciar por automação' antes de 'Iniciar por um canal'", () => {
    const destino: Grafo = {
      nodes: [no("canal", "inicio_canal"), no("auto", "inicio_automacao")],
      edges: [],
    };
    expect(inicioParaAcionar(destino)).toBe("auto");
    expect(inicioParaAcionar({ nodes: [no("canal", "inicio_canal")], edges: [] })).toBe("canal");
    expect(inicioParaAcionar({ nodes: [], edges: [] })).toBeNull();
  });

  it("chaves internas não viajam para o outro fluxo nem para o WebHook", () => {
    expect(respostasVisiveis({ nome: "Ana", [CHAVE_DOS_HORARIOS]: "[]" })).toEqual({ nome: "Ana" });
  });
});

describe("Mensagem de espera da transferência", () => {
  const g: Grafo = {
    nodes: [
      no("ini", "inicio_canal"),
      no("eq", "transferir_equipe", {
        mensagem: "Vou te passar para a equipe.",
        espera_minutos: 10,
        espera_mensagem: "{{nome}}, já já alguém te responde.",
        espera_vezes: 2,
      }),
    ],
    edges: [liga("ini", "eq")],
  };

  it("transfere e deixa o relógio armado sobre a sessão transferida", () => {
    const r = iniciarFluxo(g, "ini", ctx("oi"), { nome: "Ana" });
    expect(r.efeitos.map((e) => e.tipo)).toEqual(["enviar", "transferir_equipe"]);
    expect(r.sessao).toMatchObject({ status: "transferred", no_atual: "eq", tentativas: 0 });
    expect(r.sessao.retomar_em).toBe("2026-10-22T13:40:00.000Z");
  });

  it("manda até o número de vezes pedido, uma a cada intervalo, e para", () => {
    const r = iniciarFluxo(g, "ini", ctx("oi"), { nome: "Ana" });
    const vez1 = proximaMensagemDeEspera(g, r.sessao, new Date("2026-10-22T13:40:00Z"))!;
    expect(vez1.texto).toBe("Ana, já já alguém te responde.");
    expect(vez1.sessao).toMatchObject({ tentativas: 1, retomar_em: "2026-10-22T13:50:00.000Z" });
    const vez2 = proximaMensagemDeEspera(g, vez1.sessao, new Date("2026-10-22T13:50:00Z"))!;
    expect(vez2.sessao).toMatchObject({ tentativas: 2, retomar_em: null });
  });

  it("sem espera ligada, transferir encerra como sempre", () => {
    const sem: Grafo = {
      nodes: [no("ini", "inicio_canal"), no("eq", "transferir_equipe", { espera_mensagem: "x" })],
      edges: [liga("ini", "eq")],
    };
    const r = iniciarFluxo(sem, "ini", ctx("oi"));
    expect(r.sessao).toMatchObject({ status: "transferred", no_atual: null });
    expect(r.sessao.retomar_em ?? null).toBeNull();
    expect(proximaMensagemDeEspera(sem, { ...r.sessao, no_atual: "eq" }, new Date())).toBeNull();
  });

  it("ligada sem mensagem não deixa ligar o fluxo", () => {
    const sem: Grafo = {
      nodes: [no("ini", "inicio_canal"), no("eq", "transferir_equipe", { espera_minutos: 5 })],
      edges: [liga("ini", "eq")],
    };
    expect(problemasDoGrafo(sem)).toContain(
      'escreva a mensagem de espera do passo "Transferir para a equipe".',
    );
  });
});

describe("Agendar horário", () => {
  const g: Grafo = {
    nodes: [
      no("ini", "inicio_canal"),
      no("ag", "agendar_horario", { event_type_id: TIPO, tentativas: 2 }),
      no("ok", "enviar_mensagem", { texto: "Te esperamos ({{agendamento_status}})." }),
      no("sem", "enviar_mensagem", { texto: "Sem vaga agora." }),
      no("nao", "enviar_mensagem", { texto: "Tudo bem, fale com a equipe." }),
    ],
    edges: [liga("ini", "ag"), liga("ag", "ok", "proximo"), liga("ag", "sem", "sem_horario"), liga("ag", "nao", "invalida")],
  };

  it("ao chegar no passo, pede os horários ao executor", () => {
    const r = iniciarFluxo(g, "ini", ctx("oi"));
    expect(r.pendente).toEqual({ tipo: "horarios", no: "ag" });
    expect(r.efeitos).toEqual([]);
  });

  it("com horários, pergunta numerado e espera; sem horários, segue por 'Sem horário livre'", () => {
    const r = iniciarFluxo(g, "ini", ctx("oi"));
    const com = continuarComHorarios(g, r.sessao, OFERTAS, ctx(null));
    expect(textos(com.efeitos)).toEqual([
      "Escolha um horário:\n\n1. sexta-feira 23/10 às 09:00\n2. sexta-feira 23/10 às 14:00",
    ]);
    expect(com.sessao).toMatchObject({ status: "waiting_input", no_atual: "ag" });

    const sem = continuarComHorarios(g, r.sessao, [], ctx(null));
    expect(textos(sem.efeitos)).toEqual(["Sem vaga agora."]);
    expect(sem.sessao.dados[CHAVE_DOS_HORARIOS]).toBeUndefined();
  });

  it("o contato escolhe pelo número, o executor marca, e o fluxo confirma e segue por 'Marcou'", () => {
    const r = iniciarFluxo(g, "ini", ctx("oi"));
    const perguntou = continuarComHorarios(g, r.sessao, OFERTAS, ctx(null));
    const escolheu = continuarFluxo(g, perguntou.sessao, ctx("2"));
    expect(escolheu.pendente).toEqual({ tipo: "marcar", no: "ag", inicio: OFERTAS[1]!.inicio });
    expect(escolheu.sessao.dados.horario).toBe("sexta-feira 23/10 às 14:00");

    const marcou = continuarAposMarcar(g, escolheu.sessao, { ok: true, aguardaConfirmacao: false }, ctx(null));
    expect(textos(marcou.efeitos)).toEqual([
      "Pronto! Seu horário ficou marcado para sexta-feira 23/10 às 14:00. Até lá!",
      "Te esperamos (confirmado).",
    ]);
    expect(marcou.sessao.dados[CHAVE_DOS_HORARIOS]).toBeUndefined();
  });

  it("atendimento que a equipe aprova: a mensagem diz que o horário está reservado, não confirmado", () => {
    const r = iniciarFluxo(g, "ini", ctx("oi"));
    const escolheu = continuarFluxo(g, continuarComHorarios(g, r.sessao, OFERTAS, ctx(null)).sessao, ctx("1"));
    const marcou = continuarAposMarcar(g, escolheu.sessao, { ok: true, aguardaConfirmacao: true }, ctx(null));
    expect(textos(marcou.efeitos)[0]).toBe("Separei sexta-feira 23/10 às 09:00 para você. A equipe confirma em breve.");
    expect(marcou.sessao.dados.agendamento_status).toBe("aguardando confirmação");
  });

  it("horário ocupado na última hora: avisa e oferece de novo", () => {
    const r = iniciarFluxo(g, "ini", ctx("oi"));
    const escolheu = continuarFluxo(g, continuarComHorarios(g, r.sessao, OFERTAS, ctx(null)).sessao, ctx("1"));
    const ocupado = continuarAposMarcar(g, escolheu.sessao, { ok: false, ocupado: true }, ctx(null));
    expect(textos(ocupado.efeitos)).toEqual(["Esse horário acabou de ser ocupado. Veja os que estão livres agora:"]);
    expect(ocupado.pendente).toEqual({ tipo: "horarios", no: "ag" });
  });

  it("outra recusa da Agenda segue por 'Sem horário livre'", () => {
    const r = iniciarFluxo(g, "ini", ctx("oi"));
    const escolheu = continuarFluxo(g, continuarComHorarios(g, r.sessao, OFERTAS, ctx(null)).sessao, ctx("1"));
    const recusou = continuarAposMarcar(g, escolheu.sessao, { ok: false, ocupado: false }, ctx(null));
    expect(textos(recusou.efeitos)).toEqual(["Sem vaga agora."]);
  });

  it("resposta que não é horário: repete a lista e, nas tentativas, segue por 'Não escolheu'", () => {
    const r = iniciarFluxo(g, "ini", ctx("oi"));
    const perguntou = continuarComHorarios(g, r.sessao, OFERTAS, ctx(null));
    const errou = continuarFluxo(g, perguntou.sessao, ctx("amanhã?"));
    expect(textos(errou.efeitos)[0]).toContain("Não entendi.");
    expect(errou.sessao.status).toBe("waiting_input");
    const desistiu = continuarFluxo(g, errou.sessao, ctx("sei lá"));
    expect(textos(desistiu.efeitos)).toEqual(["Tudo bem, fale com a equipe."]);
  });

  it("'Marcou' sem ligação nunca cai no caminho de 'Sem horário livre'", () => {
    const so: Grafo = {
      nodes: [no("ini", "inicio_canal"), no("ag", "agendar_horario", { event_type_id: TIPO }), no("sem", "enviar_mensagem", { texto: "Sem vaga." })],
      edges: [liga("ini", "ag"), liga("ag", "sem", "sem_horario")],
    };
    const r = iniciarFluxo(so, "ini", ctx("oi"));
    const escolheu = continuarFluxo(so, continuarComHorarios(so, r.sessao, OFERTAS, ctx(null)).sessao, ctx("1"));
    const marcou = continuarAposMarcar(so, escolheu.sessao, { ok: true, aguardaConfirmacao: false }, ctx(null));
    expect(textos(marcou.efeitos)).not.toContain("Sem vaga.");
  });

  it("sem tipo de atendimento escolhido, o fluxo não liga", () => {
    const sem: Grafo = { nodes: [no("ini", "inicio_canal"), no("ag", "agendar_horario")], edges: [liga("ini", "ag")] };
    expect(problemasDoGrafo(sem)).toContain('escolha o tipo de atendimento do passo "Agendar horário".');
  });
});

describe("Enviar mídia e Negócio no funil", () => {
  it("mídia sai como efeito próprio, com a legenda preenchida", () => {
    const g: Grafo = {
      nodes: [
        no("ini", "inicio_canal"),
        no("foto", "enviar_midia", {
          storage_path: `${ORG}/chatbot/${FLUXO}/a.jpg`,
          tipo: "image",
          mime: "image/jpeg",
          legenda: "Para você, {{nome}}",
        }),
      ],
      edges: [liga("ini", "foto")],
    };
    const r = iniciarFluxo(g, "ini", ctx("oi"), { nome: "Ana" });
    expect(r.efeitos).toEqual([
      {
        tipo: "midia",
        storage_path: `${ORG}/chatbot/${FLUXO}/a.jpg`,
        midia: "image",
        mime: "image/jpeg",
        legenda: "Para você, Ana",
      },
    ]);
  });

  it("mídia sem arquivo não sai e não deixa ligar", () => {
    const g: Grafo = { nodes: [no("ini", "inicio_canal"), no("foto", "enviar_midia")], edges: [liga("ini", "foto")] };
    expect(iniciarFluxo(g, "ini", ctx("oi")).efeitos).toEqual([]);
    expect(problemasDoGrafo(g)).toContain('escolha o arquivo do passo "Enviar mídia".');
  });

  it("negócio no funil leva o título preenchido", () => {
    const g: Grafo = {
      nodes: [
        no("ini", "inicio_canal"),
        no("neg", "negocio_funil", { pipeline_id: FUNIL, stage_id: ETAPA, titulo: "Orçamento — {{servico}}" }),
      ],
      edges: [liga("ini", "neg")],
    };
    expect(iniciarFluxo(g, "ini", ctx("oi"), { servico: "pintura" }).efeitos).toEqual([
      { tipo: "negocio", pipeline_id: FUNIL, stage_id: ETAPA, titulo: "Orçamento — pintura" },
    ]);
  });

  it("só arquivo do chatbot da própria organização é aceito", () => {
    expect(caminhoDoChatbotDaOrg(`${ORG}/chatbot/${FLUXO}/a.jpg`, ORG)).toBe(true);
    expect(caminhoDoChatbotDaOrg(`${OUTRO}/chatbot/${FLUXO}/a.jpg`, ORG)).toBe(false);
    expect(caminhoDoChatbotDaOrg(`${ORG}/conversa/a.jpg`, ORG)).toBe(false);
    expect(caminhoDoChatbotDaOrg(`${ORG}/chatbot/../${OUTRO}/x.jpg`, ORG)).toBe(false);
  });
});

describe("Horários oferecidos", () => {
  it("espalha pelos dias em vez de oferecer só a primeira manhã", () => {
    const h = (iso: string) => ({ inicio: new Date(iso), fim: new Date(iso) });
    const slots = [
      h("2026-10-23T12:00:00Z"),
      h("2026-10-23T12:30:00Z"),
      h("2026-10-23T13:00:00Z"),
      h("2026-10-26T12:00:00Z"),
      h("2026-10-27T12:00:00Z"),
    ];
    const r = escolherOfertas(slots, "America/Sao_Paulo", 3).map((s) => s.inicio.toISOString());
    expect(r).toEqual(["2026-10-23T12:00:00.000Z", "2026-10-26T12:00:00.000Z", "2026-10-27T12:00:00.000Z"]);
  });
});

describe("Testar o fluxo na tela", () => {
  const opcoes = { fluxoAtual: FLUXO, fuso: "America/Sao_Paulo", agora: () => new Date(AGORA) };
  const menu: Grafo = {
    nodes: [
      no("ini", "inicio_canal", { gatilho: "palavra_chave", palavras: ["menu"] }),
      no("esc", "pedir_escolher", { pergunta: "O que deseja?", opcoes: ["Agendar", "Voltar"] }),
      no("ag", "agendar_horario", { event_type_id: TIPO, quantidade: 2 }),
      no("volta", "acionar_fluxo", { flow_id: FLUXO }),
    ],
    edges: [liga("ini", "esc"), liga("esc", "ag", "opcao-0"), liga("esc", "volta", "opcao-1")],
  };

  it("sem a palavra-chave o fluxo não começa, e a tela diz por quê", () => {
    const e = enviarNoTeste(menu, comecarTeste(menu), "oi", opcoes);
    expect(e.bolhas.at(-1)).toEqual({ de: "evento", evento: { tipo: "nao_comecaria" } });
    expect(e.sessao).toBeNull();
  });

  it("roda o motor de verdade: pergunta, escolhe, horários de exemplo, marca de exemplo", () => {
    let e = enviarNoTeste(menu, comecarTeste(menu), "quero o menu", opcoes);
    expect(e.bolhas.at(-1)).toMatchObject({ de: "bot" });
    expect(e.noAtual).toBe("esc");
    e = enviarNoTeste(menu, e, "1", opcoes);
    expect(e.bolhas.some((b) => b.de === "evento" && b.evento.tipo === "horarios_de_exemplo")).toBe(true);
    expect(e.espera).toEqual({ tipo: "mensagem" });
    e = enviarNoTeste(menu, e, "1", opcoes);
    expect(e.bolhas.some((b) => b.de === "evento" && b.evento.tipo === "marcou_de_exemplo")).toBe(true);
    expect(e.espera).toEqual({ tipo: "fim" });
  });

  it("'voltar ao início' deste fluxo roda; outro fluxo é só anunciado", () => {
    let e = enviarNoTeste(menu, comecarTeste(menu), "menu", opcoes);
    e = enviarNoTeste(menu, e, "2", opcoes);
    expect(e.bolhas.some((b) => b.de === "evento" && b.evento.tipo === "voltou_ao_inicio")).toBe(true);
    expect(e.noAtual).toBe("esc");

    const outro: Grafo = {
      nodes: [no("ini", "inicio_automacao"), no("vai", "acionar_fluxo", { flow_id: OUTRO })],
      edges: [liga("ini", "vai")],
    };
    const comeco = comecarTeste(outro);
    expect(comeco.espera).toEqual({ tipo: "comecar" });
    const f = comecarPorAutomacao(outro, comeco, opcoes);
    expect(f.bolhas.at(-1)).toEqual({ de: "evento", evento: { tipo: "abriria_fluxo", flow_id: OUTRO } });
    expect(f.espera).toEqual({ tipo: "fim" });
  });

  it("WebHook: quem testa escolhe o desfecho; espera: pula o relógio", () => {
    const g: Grafo = {
      nodes: [
        no("ini", "inicio_canal"),
        no("wh", "webhook", { url: "https://x.example.com" }),
        no("ok", "enviar_mensagem", { texto: "certo" }),
        no("ruim", "enviar_mensagem", { texto: "falhou" }),
        no("eq", "transferir_equipe", { espera_minutos: 5, espera_mensagem: "aguenta aí" }),
      ],
      edges: [liga("ini", "wh"), liga("wh", "ok", "proximo"), liga("wh", "ruim", "falha"), liga("ruim", "eq")],
    };
    let e = enviarNoTeste(g, comecarTeste(g), "oi", opcoes);
    expect(e.espera).toEqual({ tipo: "webhook" });
    e = responderWebhookNoTeste(g, e, false, opcoes);
    expect(e.bolhas.filter((b) => b.de === "bot").map((b) => (b as { texto: string }).texto)).toEqual(["falhou"]);
    expect(e.espera.tipo).toBe("espera_da_equipe");
    e = pularEspera(g, e, opcoes);
    expect(e.bolhas.at(-1)).toEqual({ de: "bot", texto: "aguenta aí" });
    expect(e.espera).toEqual({ tipo: "fim" });
  });

  it("horários de exemplo caem em dia útil, no fuso da empresa", () => {
    const h = horariosDeExemplo(new Date(AGORA), "America/Sao_Paulo", 3);
    expect(h.map((x) => x.quando)).toEqual([
      "sexta-feira 23/10 às 09:00",
      "sexta-feira 23/10 às 10:00",
      "sexta-feira 23/10 às 14:00",
    ]);
  });
});
