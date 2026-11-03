"use client";

/**
 * Editor do Chatbot Builder, no modelo do editor da Umbler Talk: quadro com
 * pontinhos, botão "+" que abre o menu de passos (busca, grupos, clique ou
 * arraste; atalho Tab), "Ver ideias de bot", desfazer/refazer, "Organizar
 * blocos automaticamente", salvar e "Alterações não salvas". Os passos são
 * ligados por linhas curvas com seta. O desenho vai inteiro num PATCH
 * (`grafo`). Ligar o fluxo passa pela validação do servidor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  MarkerType,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  FlaskConical,
  Lightbulb,
  Loader2,
  Pencil,
  Plus,
  Redo2,
  Save,
  Search,
  Spline,
  Undo2,
  X,
} from "lucide-react";

import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { IDEIAS_DE_BOT, montarIdeia, passosDaIdeia, type Ideia } from "@/lib/chatbot/ideias";
import { organizarBlocos } from "@/lib/chatbot/organizar";
import {
  colarPassos,
  copiarPassos,
  lerCopiados,
  type Copiados,
} from "@/lib/chatbot/area-de-transferencia";
import { randomId } from "@/lib/random-id";
import { PASSOS_AVANCADOS } from "@/lib/chatbot/passos-avancados";
import { useT } from "@/hooks/i18n/useT";
import {
  GRUPOS_DE_PASSO,
  PASSOS,
  configDoPasso,
  saidasDoPasso,
  ehTipoDePasso,
  type Grafo,
  type TipoDePasso,
} from "@/lib/chatbot/passos";

import { AcoesDoNoContext } from "./acoes-do-no";
import { PassoNode, type NodeData } from "./node-types";
import { IconeDoPasso, ICONE_DO_GRUPO } from "./icones";
import { NodePanel, type OpcoesDoPainel } from "./NodePanel";
import { PainelDeAjuda } from "./PainelDeAjuda";
import { TesteDoFluxo } from "./TesteDoFluxo";

type Flow = { id: string; name: string; is_active: boolean; grafo: Grafo };

const NODE_TYPES = Object.fromEntries(PASSOS.map((p) => [p.tipo, PassoNode]));
const ARRASTO = "application/x-passo-do-chatbot";
/** Atalho de um follow-up da empresa: o card já nasce com ele escolhido. */
const ARRASTO_FOLLOWUP = "application/x-followup-do-chatbot";

type Foto = { nodes: Node<NodeData>[]; edges: Edge[] };

/**
 * A linha entre dois passos, como na Umbler: curva, contínua, com seta no
 * passo seguinte. Cor fixa (não token de tema) porque o React Flow monta o id
 * do marcador da seta a partir da cor, e `var(--x)` dentro de `url(#…)` quebra.
 */
const COR_DA_LINHA = "#94a3b8";
const COR_DA_LINHA_SELECIONADA = "#8b5cf6";
/** Onde o Ctrl+C guarda os passos (no navegador), para colar em outro fluxo. */
// Sem o nome do produto: a chave vale para qualquer marca da instalação.
const CHAVE_DOS_COPIADOS = "chatbot:passos-copiados";

function comoLinha(e: Edge): Edge {
  const cor = e.selected ? COR_DA_LINHA_SELECIONADA : COR_DA_LINHA;
  return {
    ...e,
    type: "default",
    animated: false,
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18, color: cor },
    style: { stroke: cor, strokeWidth: e.selected ? 2.5 : 2 },
  };
}

/** Botão redondo da barra de cima, com a dica (e o atalho) ao passar o mouse. */
function BotaoDaBarra(props: {
  dica: string;
  onClick: () => void;
  disabled?: boolean;
  className: string;
  testid?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={props.onClick}
          disabled={props.disabled}
          className={props.className}
          aria-label={props.dica}
          data-testid={props.testid}
        >
          {props.children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{props.dica}</TooltipContent>
    </Tooltip>
  );
}

function paraReactFlow(g: Grafo): Foto {
  return {
    nodes: g.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })),
    edges: g.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
    })),
  };
}

function paraGrafo(nodes: Node<NodeData>[], edges: Edge[]): Grafo {
  return {
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type ?? "",
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      data: n.data,
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
    })),
  };
}

function dadosPadrao(tipo: TipoDePasso): NodeData {
  return configDoPasso[tipo].parse({}) as NodeData;
}

/** Ligação cujo ponto de saída não existe mais (ex.: opção apagada do menu) cai fora. */
function semLigacoesOrfas(nodes: Node<NodeData>[], edges: Edge[]): Edge[] {
  const porId = new Map(nodes.map((n) => [n.id, n]));
  return edges.filter((e) => {
    const origem = porId.get(e.source);
    if (!origem || !porId.has(e.target) || !origem.type || !ehTipoDePasso(origem.type))
      return false;
    const saidas = saidasDoPasso(origem.type, origem.data).map((s) => s.id);
    return saidas.includes(e.sourceHandle ?? "proximo");
  });
}

export function ChatbotCanvas(props: {
  flow: Flow;
  opcoes: OpcoesDoPainel;
  /** O plano inclui o "Chatbot avançado"? (Impulso e Escala) */
  avancadoLiberado?: boolean;
}) {
  return (
    <ReactFlowProvider>
      <TooltipProvider delayDuration={200}>
        <Editor {...props} />
      </TooltipProvider>
    </ReactFlowProvider>
  );
}

function Editor({
  flow,
  opcoes,
  avancadoLiberado = true,
}: {
  flow: Flow;
  opcoes: OpcoesDoPainel;
  avancadoLiberado?: boolean;
}) {
  const t = useT();
  const inicial = useMemo(() => {
    const foto = paraReactFlow(flow.grafo);
    if (foto.nodes.length === 0) {
      foto.nodes.push({
        id: randomId(),
        type: "inicio_canal",
        position: { x: 120, y: 80 },
        data: dadosPadrao("inicio_canal"),
      });
    }
    return foto;
  }, [flow.grafo]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>(inicial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(inicial.edges);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [menuAberto, setMenuAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [sujo, setSujo] = useState(flow.grafo.nodes.length === 0);
  const [salvando, setSalvando] = useState(false);
  /** Salvar automático parado depois de uma falha, até a próxima mudança. */
  const [autoParado, setAutoParado] = useState(false);
  const [salvoAuto, setSalvoAuto] = useState(false);
  const [ligado, setLigado] = useState(flow.is_active);
  const [nome, setNome] = useState(flow.name);
  const [editandoNome, setEditandoNome] = useState(false);
  const [passado, setPassado] = useState<Foto[]>([]);
  const [futuro, setFuturo] = useState<Foto[]>([]);
  const [testando, setTestando] = useState(false);
  const [passoDoTeste, setPassoDoTeste] = useState<string | null>(null);
  const [ideiasAbertas, setIdeiasAbertas] = useState(false);
  /** O passo cuja "Ajuda" (?) está aberta no painel da direita. */
  const [ajudaDe, setAjudaDe] = useState<string | null>(null);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const quadro = useRef<HTMLDivElement>(null);

  /** Guarda a foto atual antes de uma mudança, para o desfazer. */
  const lembrar = useCallback(() => {
    setPassado((p) => [...p.slice(-49), { nodes, edges }]);
    setFuturo([]);
    setSujo(true);
    setAutoParado(false);
    setSalvoAuto(false);
  }, [nodes, edges]);

  const desfazer = useCallback(() => {
    const foto = passado[passado.length - 1];
    if (!foto) return;
    setPassado((p) => p.slice(0, -1));
    setFuturo((f) => [...f, { nodes, edges }]);
    setNodes(foto.nodes);
    setEdges(foto.edges);
    setSujo(true);
  }, [passado, nodes, edges, setNodes, setEdges]);

  const refazer = useCallback(() => {
    const foto = futuro[futuro.length - 1];
    if (!foto) return;
    setFuturo((f) => f.slice(0, -1));
    setPassado((p) => [...p, { nodes, edges }]);
    setNodes(foto.nodes);
    setEdges(foto.edges);
    setSujo(true);
  }, [futuro, nodes, edges, setNodes, setEdges]);

  const salvar = useCallback(async (opcoes: { automatico?: boolean } = {}) => {
    setSalvando(true);
    try {
      const res = await fetch(`/api/v1/chatbot-flows/${flow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome.trim() || flow.name, grafo: paraGrafo(nodes, edges) }),
      });
      const corpo = await res.json().catch(() => null);
      if (!res.ok) {
        toast.error(corpo?.error?.message ?? t("Não foi possível salvar o fluxo."));
        // No automático, uma falha só aparece uma vez: volta a tentar na próxima mudança.
        if (opcoes.automatico) setAutoParado(true);
        return false;
      }
      // O servidor cifra o segredo do WebHook: a tela troca o texto digitado
      // pela versão salva, para o segredo não ficar aberto na memória da página.
      const salvos = (corpo?.data?.grafo?.nodes ?? []) as { id: string; data: NodeData }[];
      if (salvos.length > 0) {
        setNodes((atuais) =>
          atuais.map((n) =>
            n.type === "webhook"
              ? { ...n, data: salvos.find((x) => x.id === n.id)?.data ?? n.data }
              : n,
          ),
        );
      }
      setSujo(false);
      if (opcoes.automatico) setSalvoAuto(true);
      else toast.success(t("Fluxo salvo."));
      return true;
    } finally {
      setSalvando(false);
    }
  }, [flow.id, flow.name, nome, nodes, edges, setNodes, t]);

  async function alternarLigado(valor: boolean) {
    if (valor && sujo && !(await salvar())) return;
    const res = await fetch(`/api/v1/chatbot-flows/${flow.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: valor }),
    });
    if (!res.ok) {
      const corpo = await res.json().catch(() => null);
      toast.error(corpo?.error?.message ?? t("Não foi possível mudar o fluxo."));
      return;
    }
    setLigado(valor);
    toast.success(valor ? t("Fluxo ligado: ele já responde no WhatsApp.") : t("Fluxo desligado."));
  }


  // Salvar automático: com o fluxo DESLIGADO, 2 s depois da última mudança.
  // Ligado, não — o desenho pela metade passaria a responder clientes no meio
  // da edição. Aí o salvar é no botão (ou Ctrl+S), quando a pessoa terminar.
  useEffect(() => {
    if (!sujo || ligado || salvando || autoParado) return;
    const relogio = setTimeout(() => void salvar({ automatico: true }), 2000);
    return () => clearTimeout(relogio);
  }, [sujo, ligado, salvando, autoParado, nodes, edges, nome, salvar]);

  // Sair com alterações não salvas pergunta antes.
  useEffect(() => {
    function antesDeSair(ev: BeforeUnloadEvent) {
      if (!sujo) return;
      ev.preventDefault();
    }
    window.addEventListener("beforeunload", antesDeSair);
    return () => window.removeEventListener("beforeunload", antesDeSair);
  }, [sujo]);

  const adicionar = useCallback(
    (tipo: TipoDePasso, posicao?: { x: number; y: number }, dados?: NodeData) => {
      lembrar();
      const caixa = quadro.current?.getBoundingClientRect();
      const centro = caixa
        ? screenToFlowPosition({ x: caixa.left + caixa.width / 2, y: caixa.top + caixa.height / 3 })
        : { x: 200, y: 200 };
      const novo: Node<NodeData> = {
        id: randomId(),
        type: tipo,
        position: posicao ?? {
          x: centro.x + (Math.random() * 60 - 30),
          y: centro.y + (Math.random() * 60 - 30),
        },
        data: { ...dadosPadrao(tipo), ...(dados ?? {}) },
      };
      setNodes((atuais) => [...atuais, novo]);
      setSelecionado(novo.id);
      setMenuAberto(false);
      setBusca("");
    },
    [lembrar, screenToFlowPosition, setNodes],
  );

  const ligar = useCallback(
    (c: Connection) => {
      lembrar();
      // Uma saída leva a UM passo: ligar de novo troca o destino.
      setEdges((atuais) =>
        addEdge(
          { ...c, id: randomId(), sourceHandle: c.sourceHandle ?? "proximo" },
          atuais.filter(
            (e) =>
              !(
                e.source === c.source &&
                (e.sourceHandle ?? "proximo") === (c.sourceHandle ?? "proximo")
              ),
          ),
        ),
      );
    },
    [lembrar, setEdges],
  );

  const mudarDados = useCallback(
    (id: string, dados: NodeData) => {
      lembrar();
      setNodes((atuais) => {
        const novos = atuais.map((n) => (n.id === id ? { ...n, data: dados } : n));
        setEdges((ligacoes) => semLigacoesOrfas(novos, ligacoes));
        return novos;
      });
    },
    [lembrar, setNodes, setEdges],
  );

  const apagar = useCallback(
    (id: string) => {
      lembrar();
      setNodes((atuais) => atuais.filter((n) => n.id !== id));
      setEdges((atuais) => atuais.filter((e) => e.source !== id && e.target !== id));
      setSelecionado(null);
    },
    [lembrar, setNodes, setEdges],
  );

  const duplicar = useCallback(
    (id: string) => {
      const original = nodes.find((n) => n.id === id);
      if (!original) return;
      lembrar();
      const copia: Node<NodeData> = {
        id: randomId(),
        type: original.type,
        position: { x: original.position.x + 40, y: original.position.y + 40 },
        data: structuredClone(original.data),
      };
      setNodes((atuais) => [...atuais.map((n) => ({ ...n, selected: false })), { ...copia, selected: true }]);
      setSelecionado(copia.id);
    },
    [nodes, lembrar, setNodes],
  );

  /**
   * Ctrl+C / Ctrl+V: os passos marcados (ou o selecionado) e as ligações entre
   * eles. Fica no armazenamento do navegador, para colar em outro fluxo; sem
   * ele (janela privada), vale só nesta página.
   */
  const copiadosAqui = useRef<Copiados | null>(null);
  const copiar = useCallback((): boolean => {
    const marcados = nodes.filter((n) => n.selected).map((n) => n.id);
    const ids = marcados.length > 0 ? marcados : selecionado ? [selecionado] : [];
    const copiados = copiarPassos(
      nodes.map((n) => ({ id: n.id, type: n.type ?? "", position: n.position, data: n.data })),
      edges,
      ids,
    );
    if (!copiados) return false;
    copiadosAqui.current = copiados;
    try {
      localStorage.setItem(CHAVE_DOS_COPIADOS, JSON.stringify(copiados));
    } catch {
      // Sem armazenamento: o colar desta página continua valendo.
    }
    toast.success(
      copiados.passos.length === 1
        ? t("1 passo copiado.")
        : `${copiados.passos.length} ${t("passos copiados.")}`,
    );
    return true;
  }, [nodes, edges, selecionado, t]);

  const colar = useCallback((): boolean => {
    let copiados: Copiados | null = null;
    try {
      copiados = lerCopiados(localStorage.getItem(CHAVE_DOS_COPIADOS));
    } catch {
      copiados = null;
    }
    copiados ??= copiadosAqui.current;
    if (!copiados) return false;
    lembrar();
    const caixa = quadro.current?.getBoundingClientRect();
    const onde = caixa
      ? screenToFlowPosition({ x: caixa.left + caixa.width / 3, y: caixa.top + caixa.height / 4 })
      : { x: 200, y: 200 };
    const r = colarPassos(copiados, randomId, onde);
    setNodes((atuais) => [
      ...atuais.map((n) => ({ ...n, selected: false })),
      ...r.passos.map((p) => ({
        id: p.id,
        type: p.type,
        position: p.position,
        data: p.data as NodeData,
        selected: true,
      })),
    ]);
    setEdges((atuais) => [
      ...atuais,
      ...r.ligacoes.map((l) => comoLinha({ ...l, sourceHandle: l.sourceHandle ?? "proximo" })),
    ]);
    setSelecionado(r.passos.length === 1 ? r.passos[0]!.id : null);
    if (r.semSegredo)
      toast.warning(t("WebHook colado sem o segredo: preencha de novo no passo."));
    return true;
  }, [lembrar, screenToFlowPosition, setNodes, setEdges, t]);

  const abrirAjuda = useCallback((id: string) => {
    setTestando(false);
    setPassoDoTeste(null);
    setAjudaDe(id);
  }, []);

  const acoesDoNo = useMemo(
    () => ({ ajuda: abrirAjuda, duplicar, apagar }),
    [abrirAjuda, duplicar, apagar],
  );

  // Tab abre os passos; Ctrl+S salva; Ctrl+Z desfaz; Ctrl+Shift+Z / Ctrl+Y refaz;
  // Ctrl+O / Ctrl+P duplicam o passo selecionado.
  useEffect(() => {
    function teclado(ev: KeyboardEvent) {
      const alvo = ev.target as HTMLElement | null;
      if (alvo && ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName)) return;
      // Tab abre o menu de passos (Umbler) — só com o foco no quadro, para não
      // roubar o Tab de quem navega pelos botões com o teclado.
      if (
        ev.key === "Tab" &&
        !ev.shiftKey &&
        !ev.ctrlKey &&
        !ev.metaKey &&
        (!alvo || alvo === document.body || alvo.closest(".react-flow"))
      ) {
        ev.preventDefault();
        setMenuAberto((v) => !v);
        return;
      }
      if (!(ev.ctrlKey || ev.metaKey)) return;
      const k = ev.key.toLowerCase();
      // Copiar e colar passos — com texto selecionado na página, o Ctrl+C é do texto.
      if (k === "c" && !window.getSelection()?.toString() && copiar()) {
        ev.preventDefault();
        return;
      }
      if (k === "v" && colar()) {
        ev.preventDefault();
        return;
      }
      if ((k === "o" || k === "p") && selecionado) {
        // Duplicar bloco, como na Umbler (Ctrl + O ou Ctrl + P).
        ev.preventDefault();
        duplicar(selecionado);
        return;
      }
      if (k === "s") {
        ev.preventDefault();
        void salvar();
      } else if (k === "z" && !ev.shiftKey) {
        ev.preventDefault();
        desfazer();
      } else if (k === "y" || (k === "z" && ev.shiftKey)) {
        ev.preventDefault();
        refazer();
      }
    }
    window.addEventListener("keydown", teclado);
    return () => window.removeEventListener("keydown", teclado);
  }, [salvar, desfazer, refazer, selecionado, duplicar, copiar, colar]);

  const organizar = useCallback(() => {
    if (nodes.length === 0) return;
    lembrar();
    const posicoes = organizarBlocos(
      nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        largura: n.measured?.width,
        altura: n.measured?.height,
      })),
      edges,
    );
    setNodes((atuais) =>
      atuais.map((n) => {
        const p = posicoes.get(n.id);
        return p ? { ...n, position: p } : n;
      }),
    );
    window.requestAnimationFrame(() => void fitView({ padding: 0.3, maxZoom: 1, duration: 300 }));
  }, [nodes, edges, lembrar, setNodes, fitView]);

  const usarIdeia = useCallback(
    (ideia: Ideia) => {
      lembrar();
      // Quadro novo (só o início que a tela pôs, sem ligação): a ideia o substitui.
      const vazio = nodes.length <= 1 && edges.length === 0 && nodes.every((n) => n.type === "inicio_canal");
      const direita = vazio
        ? 0
        : Math.max(...nodes.map((n) => n.position.x + (n.measured?.width ?? 260))) + 160;
      const topo = vazio ? 0 : Math.min(...nodes.map((n) => n.position.y));
      const g = montarIdeia(ideia, randomId, { x: direita, y: topo });
      const novos: Node<NodeData>[] = g.nodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
      }));
      const ligacoes: Edge[] = g.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
      }));
      setNodes((atuais) => (vazio ? novos : [...atuais, ...novos]));
      setEdges((atuais) => (vazio ? ligacoes : [...atuais, ...ligacoes]));
      setSelecionado(null);
      setIdeiasAbertas(false);
      toast.success(t("Ideia adicionada ao quadro. Configure os passos e salve."));
      window.requestAnimationFrame(() => void fitView({ padding: 0.3, maxZoom: 1, duration: 300 }));
    },
    [nodes, edges, lembrar, setNodes, setEdges, fitView, t],
  );

  const edgesNaTela = useMemo(() => edges.map(comoLinha), [edges]);

  const passosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return PASSOS.filter(
      (p) =>
        !termo ||
        t(p.nome).toLowerCase().includes(termo) ||
        t(p.descricao).toLowerCase().includes(termo),
    );
  }, [busca, t]);
  // Os follow-ups da empresa viram atalhos na seção "Follow-ups" (roteiro de
  // atendimento não: quem o conduz é o agente de IA).
  const followupsFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return opcoes.followups.filter(
      (f) =>
        !f.roteiro &&
        (!termo || f.nome.toLowerCase().includes(termo) || "follow-up".includes(termo)),
    );
  }, [busca, opcoes.followups]);
  const dadosDoFollowup = (f: { id: string; nome: string }): NodeData => ({
    pointer_id: f.id,
    nome_do_followup: f.nome,
  });

  const noDaAjuda = ajudaDe ? (nodes.find((n) => n.id === ajudaDe) ?? null) : null;
  const noSelecionado =
    testando || noDaAjuda ? null : (nodes.find((n) => n.id === selecionado) ?? null);

  // O passo em que o teste parou ganha destaque no quadro.
  const nodesNaTela = useMemo(
    () =>
      testando && passoDoTeste
        ? nodes.map((n) =>
            n.id === passoDoTeste
              ? { ...n, className: "rounded-xl ring-4 ring-emerald-500/70" }
              : n,
          )
        : nodes,
    [nodes, testando, passoDoTeste],
  );

  const botaoRedondo =
    "flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground disabled:opacity-40";

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* ── barra de cima ─────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <Link
          href="/app/ai/chatbots"
          className="mr-2 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("Chatbots")}
        </Link>
        <BotaoDaBarra
          dica={t("Escolher novo passo (Tab)")}
          onClick={() => {
            setIdeiasAbertas(false);
            setMenuAberto((v) => !v);
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:opacity-90"
          testid="chatbot-adicionar-passo"
        >
          <Plus className="h-5 w-5" />
        </BotaoDaBarra>
        <BotaoDaBarra
          dica={t("Ver ideias de bot")}
          onClick={() => {
            setMenuAberto(false);
            setIdeiasAbertas((v) => !v);
          }}
          className={botaoRedondo}
          testid="chatbot-ideias"
        >
          <Lightbulb className="h-4 w-4" />
        </BotaoDaBarra>
        <BotaoDaBarra
          dica={t("Desfazer (Ctrl + Z)")}
          onClick={desfazer}
          disabled={passado.length === 0}
          className={botaoRedondo}
        >
          <Undo2 className="h-4 w-4" />
        </BotaoDaBarra>
        <BotaoDaBarra
          dica={t("Refazer (Ctrl + Y)")}
          onClick={refazer}
          disabled={futuro.length === 0}
          className={botaoRedondo}
        >
          <Redo2 className="h-4 w-4" />
        </BotaoDaBarra>
        <BotaoDaBarra
          dica={t("Organizar blocos automaticamente")}
          onClick={organizar}
          className={botaoRedondo}
          testid="chatbot-organizar"
        >
          <Spline className="h-4 w-4" />
        </BotaoDaBarra>
        <BotaoDaBarra
          dica={t("Salvar (Ctrl + S)")}
          onClick={() => void salvar()}
          disabled={salvando}
          className={botaoRedondo}
          testid="chatbot-salvar"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </BotaoDaBarra>
        <button
          type="button"
          onClick={() => {
            if (testando) {
              setTestando(false);
              setPassoDoTeste(null);
              return;
            }
            setSelecionado(null);
            setTestando(true);
          }}
          className={`ml-1 flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors ${
            testando
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-surface-elevated hover:text-foreground"
          }`}
          data-testid="chatbot-testar"
        >
          <FlaskConical className="h-4 w-4" />
          {t("Testar")}
        </button>
        <span
          className="ml-2 flex items-center gap-1.5 text-sm"
          data-testid="chatbot-estado"
          title={
            ligado
              ? t("O fluxo está ligado: as mudanças só valem para os clientes quando você salvar.")
              : t("Com o fluxo desligado, o editor salva sozinho.")
          }
        >
          {sujo && !ligado && !autoParado ? (
            <span className="text-muted-foreground">{t("Salvando…")}</span>
          ) : sujo ? (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              {t("Alterações não salvas")}
            </>
          ) : (
            <span className="text-muted-foreground">
              {salvoAuto ? t("Salvo automaticamente") : t("Tudo salvo")}
            </span>
          )}
        </span>

        <div className="ml-auto flex items-center gap-4">
          {editandoNome ? (
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              onBlur={() => {
                setEditandoNome(false);
                if (nome.trim() && nome !== flow.name) setSujo(true);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className="h-8 w-56 rounded-md border border-border bg-surface px-2 text-sm"
              maxLength={120}
              aria-label={t("Nome do fluxo")}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditandoNome(true)}
              className="flex items-center gap-1.5 text-sm font-semibold"
            >
              {nome}
              <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={ligado}
              onCheckedChange={(v) => void alternarLigado(v)}
              data-testid="chatbot-ligar"
            />
            {ligado ? t("Ligado") : t("Desligado")}
          </label>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
        {/* ── ideias de bot (lâmpada) ───────────────────────── */}
        {ideiasAbertas ? (
          <div
            className="absolute top-4 left-4 z-20 flex max-h-[calc(100%-2rem)] w-[min(540px,calc(100%-2rem))] flex-col rounded-2xl border border-border bg-surface shadow-xl"
            data-testid="chatbot-painel-de-ideias"
          >
            <div className="flex items-center gap-3 border-b border-border p-4">
              <Lightbulb className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold">{t("Ideias de bot")}</span>
              <button
                type="button"
                onClick={() => setIdeiasAbertas(false)}
                aria-label={t("Fechar")}
                className="ml-auto text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <p className="mb-3 text-xs text-muted-foreground">
                {t(
                  "Escolha um fluxo pronto para começar. Ele entra no quadro já ligado; depois é só ajustar os textos e salvar.",
                )}
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {IDEIAS_DE_BOT.map((ideia) => {
                  const trancada =
                    !avancadoLiberado && passosDaIdeia(ideia).some((p) => PASSOS_AVANCADOS.has(p));
                  return (
                    <button
                      key={ideia.id}
                      type="button"
                      disabled={trancada}
                      onClick={() => usarIdeia(ideia)}
                      className={
                        trancada
                          ? "cursor-not-allowed rounded-xl border border-dashed border-border bg-background p-3 text-left opacity-60"
                          : "rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary/60 hover:bg-surface-elevated"
                      }
                      data-testid={`ideia-${ideia.id}`}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        {t(ideia.nome)}
                        {trancada ? (
                          <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                            {t("Plano Impulso")}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                        {t(ideia.descricao)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}

        {/* ── menu de passos ("+") ─────────────────────────── */}
        {menuAberto ? (
          <div
            className="absolute top-4 left-4 z-20 flex max-h-[calc(100%-2rem)] w-[min(540px,calc(100%-2rem))] flex-col rounded-2xl border border-border bg-surface shadow-xl"
            data-testid="chatbot-menu-de-passos"
          >
            <div className="flex items-center gap-3 border-b border-border p-4">
              <span className="text-sm font-semibold">✋ {t("Clique ou arraste")}</span>
              <div className="relative ml-auto flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder={t("Pesquisar passo")}
                  className="h-9 w-full rounded-full border border-border bg-background pr-3 pl-9 text-sm outline-hidden focus:border-primary"
                />
              </div>
              <button
                type="button"
                onClick={() => setMenuAberto(false)}
                aria-label={t("Fechar")}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              {GRUPOS_DE_PASSO.map((grupo) => {
                const doGrupo = passosFiltrados.filter((p) => p.grupo === grupo.id);
                const atalhos = grupo.id === "followups" ? followupsFiltrados : [];
                if (doGrupo.length === 0 && atalhos.length === 0) return null;
                const IconeGrupo = ICONE_DO_GRUPO[grupo.id];
                return (
                  <section key={grupo.id} className="mb-5 last:mb-0">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                      {IconeGrupo ? <IconeGrupo className="h-4 w-4" /> : null}
                      {t(grupo.nome)}
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {doGrupo.map((p) => {
                        // Passo do "Chatbot avançado" fora do plano: aparece,
                        // mas trancado, dizendo qual plano libera.
                        const trancado = !avancadoLiberado && PASSOS_AVANCADOS.has(p.tipo);
                        return (
                          <button
                            key={p.tipo}
                            type="button"
                            draggable={!trancado}
                            disabled={trancado}
                            onDragStart={(ev) => {
                              if (trancado) return;
                              ev.dataTransfer.setData(ARRASTO, p.tipo);
                              ev.dataTransfer.effectAllowed = "move";
                            }}
                            onClick={() => {
                              if (!trancado) adicionar(p.tipo);
                            }}
                            className={
                              trancado
                                ? "cursor-not-allowed rounded-xl border border-dashed border-border bg-background p-3 text-left opacity-60"
                                : "rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary/60 hover:bg-surface-elevated"
                            }
                            data-testid={`menu-passo-${p.tipo}`}
                            data-trancado={trancado ? "sim" : undefined}
                          >
                            <span className="flex items-center gap-2 text-sm font-semibold">
                              <IconeDoPasso nome={p.icone} className={`h-4 w-4 ${p.cor}`} />
                              {t(p.nome)}
                              {trancado ? (
                                <span className="ml-auto rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                                  {t("Plano Impulso")}
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                              {t(p.descricao)}
                            </span>
                          </button>
                        );
                      })}
                      {atalhos.map((f) => {
                        const pronto = f.situacao === "publicado";
                        return (
                          <button
                            key={f.id}
                            type="button"
                            draggable={pronto}
                            disabled={!pronto}
                            onDragStart={(ev) => {
                              if (!pronto) return;
                              ev.dataTransfer.setData(ARRASTO, "iniciar_followup");
                              ev.dataTransfer.setData(ARRASTO_FOLLOWUP, JSON.stringify(dadosDoFollowup(f)));
                              ev.dataTransfer.effectAllowed = "move";
                            }}
                            onClick={() => {
                              if (pronto) adicionar("iniciar_followup", undefined, dadosDoFollowup(f));
                            }}
                            className={
                              pronto
                                ? "rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary/60 hover:bg-surface-elevated"
                                : "cursor-not-allowed rounded-xl border border-dashed border-border bg-background p-3 text-left opacity-60"
                            }
                            data-testid={`menu-followup-${f.id}`}
                          >
                            <span className="flex items-center gap-2 text-sm font-semibold">
                              <IconeDoPasso nome="Repeat" className="h-4 w-4 text-emerald-500" />
                              {f.nome}
                              {!pronto ? (
                                <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                                  {t(f.situacao === "rascunho" ? "Rascunho" : "Desligado")}
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                              {pronto
                                ? t("Põe o contato neste follow-up.")
                                : t("Publique em IA › Follow-ups para usar aqui.")}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {grupo.id === "followups" && !busca.trim() && followupsFiltrados.length === 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {t("Os follow-ups que você criar em IA › Follow-ups aparecem aqui como atalhos.")}
                      </p>
                    ) : null}
                  </section>
                );
              })}
              {passosFiltrados.length === 0 && followupsFiltrados.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {t("Nenhum passo com esse nome.")}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ── quadro ─────────────────────────────────────── */}
        <div
          ref={quadro}
          className="min-w-0 flex-1"
          onDragOver={(ev) => {
            if (ev.dataTransfer.types.includes(ARRASTO)) {
              ev.preventDefault();
              ev.dataTransfer.dropEffect = "move";
            }
          }}
          onDrop={(ev) => {
            const tipo = ev.dataTransfer.getData(ARRASTO);
            if (!tipo || !ehTipoDePasso(tipo)) return;
            ev.preventDefault();
            let dados: NodeData | undefined;
            try {
              const bruto = ev.dataTransfer.getData(ARRASTO_FOLLOWUP);
              // Só o id e o nome: o arrasto pode vir de fora da página.
              const lido = bruto ? (JSON.parse(bruto) as Record<string, unknown>) : null;
              dados =
                lido && typeof lido.pointer_id === "string"
                  ? { pointer_id: lido.pointer_id, nome_do_followup: String(lido.nome_do_followup ?? "") }
                  : undefined;
            } catch {
              dados = undefined;
            }
            adicionar(tipo, screenToFlowPosition({ x: ev.clientX, y: ev.clientY }), dados);
          }}
        >
          <AcoesDoNoContext.Provider value={acoesDoNo}>
          <ReactFlow
            nodes={nodesNaTela}
            edges={edgesNaTela}
            nodeTypes={NODE_TYPES}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={ligar}
            onNodeDragStart={lembrar}
            onNodesDelete={() => {
              setSujo(true);
              setSelecionado(null);
            }}
            onEdgesDelete={() => setSujo(true)}
            onBeforeDelete={async () => {
              lembrar();
              return true;
            }}
            onNodeClick={(_, n) => {
              setSelecionado(n.id);
              if (ajudaDe && ajudaDe !== n.id) setAjudaDe(null);
            }}
            onPaneClick={() => {
              setSelecionado(null);
              setMenuAberto(false);
              setIdeiasAbertas(false);
            }}
            connectionLineStyle={{ stroke: COR_DA_LINHA_SELECIONADA, strokeWidth: 2 }}
            fitView
            fitViewOptions={{ padding: 0.4, maxZoom: 1 }}
            deleteKeyCode={["Delete", "Backspace"]}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={18}
              size={1.2}
              className="!bg-background"
            />
            <Controls position="bottom-center" orientation="horizontal" showInteractive={false} />
            <MiniMap position="bottom-right" pannable zoomable className="!bg-surface" />
          </ReactFlow>
          </AcoesDoNoContext.Provider>
        </div>

        {/* ── teste do fluxo ───────────────────────────────── */}
        {testando ? (
          <aside className="w-96 shrink-0 border-l border-border bg-surface">
            <TesteDoFluxo
              fotoDoDesenho={() => paraGrafo(nodes, edges)}
              opcoes={opcoes}
              onFechar={() => {
                setTestando(false);
                setPassoDoTeste(null);
              }}
              onPasso={setPassoDoTeste}
            />
          </aside>
        ) : null}

        {/* ── ajuda do passo ("?" da mini-barra) ───────────── */}
        {noDaAjuda ? (
          <aside className="w-96 shrink-0 border-l border-border bg-surface">
            <PainelDeAjuda
              key={noDaAjuda.id}
              tipo={noDaAjuda.type ?? ""}
              dados={noDaAjuda.data}
              onClose={() => setAjudaDe(null)}
            />
          </aside>
        ) : null}

        {/* ── configuração do passo selecionado ─────────────── */}
        {noSelecionado ? (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-border bg-surface">
            <NodePanel
              key={noSelecionado.id}
              tipo={noSelecionado.type ?? ""}
              dados={noSelecionado.data}
              opcoes={opcoes}
              onChange={(d) => mudarDados(noSelecionado.id, d)}
              onClose={() => setSelecionado(null)}
              onDelete={() => apagar(noSelecionado.id)}
            />
          </aside>
        ) : null}
      </div>
    </div>
  );
}
