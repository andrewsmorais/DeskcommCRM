"use client";

/**
 * Editor do Chatbot Builder, no modelo do editor da Umbler Talk: quadro com
 * pontinhos, botão "+" que abre o menu de passos (busca, grupos, clique ou
 * arraste), desfazer/refazer, "Alterações não salvas" e salvar. O desenho vai
 * inteiro num PATCH (`grafo`). Ligar o fluxo passa pela validação do servidor.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
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
import { ArrowLeft, Loader2, Pencil, Plus, Redo2, Save, Search, Undo2, X } from "lucide-react";

import { Switch } from "@/components/ui/switch";
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

import { PassoNode, type NodeData } from "./node-types";
import { IconeDoPasso, ICONE_DO_GRUPO } from "./icones";
import { NodePanel, type OpcoesDoPainel } from "./NodePanel";

type Flow = { id: string; name: string; is_active: boolean; grafo: Grafo };

const NODE_TYPES = Object.fromEntries(PASSOS.map((p) => [p.tipo, PassoNode]));
const ARRASTO = "application/x-passo-do-chatbot";

type Foto = { nodes: Node<NodeData>[]; edges: Edge[] };

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

export function ChatbotCanvas(props: { flow: Flow; opcoes: OpcoesDoPainel }) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}

function Editor({ flow, opcoes }: { flow: Flow; opcoes: OpcoesDoPainel }) {
  const t = useT();
  const inicial = useMemo(() => {
    const foto = paraReactFlow(flow.grafo);
    if (foto.nodes.length === 0) {
      foto.nodes.push({
        id: crypto.randomUUID(),
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
  const [ligado, setLigado] = useState(flow.is_active);
  const [nome, setNome] = useState(flow.name);
  const [editandoNome, setEditandoNome] = useState(false);
  const [passado, setPassado] = useState<Foto[]>([]);
  const [futuro, setFuturo] = useState<Foto[]>([]);
  const { screenToFlowPosition } = useReactFlow();
  const quadro = useRef<HTMLDivElement>(null);

  /** Guarda a foto atual antes de uma mudança, para o desfazer. */
  const lembrar = useCallback(() => {
    setPassado((p) => [...p.slice(-49), { nodes, edges }]);
    setFuturo([]);
    setSujo(true);
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

  const salvar = useCallback(async () => {
    setSalvando(true);
    try {
      const res = await fetch(`/api/v1/chatbot-flows/${flow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome.trim() || flow.name, grafo: paraGrafo(nodes, edges) }),
      });
      if (!res.ok) {
        const corpo = await res.json().catch(() => null);
        toast.error(corpo?.error?.message ?? t("Não foi possível salvar o fluxo."));
        return false;
      }
      setSujo(false);
      toast.success(t("Fluxo salvo."));
      return true;
    } finally {
      setSalvando(false);
    }
  }, [flow.id, flow.name, nome, nodes, edges, t]);

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

  // Ctrl+S salva, Ctrl+Z desfaz, Ctrl+Shift+Z / Ctrl+Y refaz.
  useEffect(() => {
    function teclado(ev: KeyboardEvent) {
      const alvo = ev.target as HTMLElement | null;
      if (alvo && ["INPUT", "TEXTAREA"].includes(alvo.tagName)) return;
      if (!(ev.ctrlKey || ev.metaKey)) return;
      const k = ev.key.toLowerCase();
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
  }, [salvar, desfazer, refazer]);

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
    (tipo: TipoDePasso, posicao?: { x: number; y: number }) => {
      lembrar();
      const caixa = quadro.current?.getBoundingClientRect();
      const centro = caixa
        ? screenToFlowPosition({ x: caixa.left + caixa.width / 2, y: caixa.top + caixa.height / 3 })
        : { x: 200, y: 200 };
      const novo: Node<NodeData> = {
        id: crypto.randomUUID(),
        type: tipo,
        position: posicao ?? {
          x: centro.x + (Math.random() * 60 - 30),
          y: centro.y + (Math.random() * 60 - 30),
        },
        data: dadosPadrao(tipo),
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
          { ...c, id: crypto.randomUUID(), sourceHandle: c.sourceHandle ?? "proximo" },
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

  const passosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return PASSOS.filter(
      (p) =>
        !termo ||
        t(p.nome).toLowerCase().includes(termo) ||
        t(p.descricao).toLowerCase().includes(termo),
    );
  }, [busca, t]);

  const noSelecionado = nodes.find((n) => n.id === selecionado) ?? null;

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
        <button
          type="button"
          onClick={() => setMenuAberto((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm hover:opacity-90"
          aria-label={t("Adicionar passo")}
          data-testid="chatbot-adicionar-passo"
        >
          <Plus className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={desfazer}
          disabled={passado.length === 0}
          className={botaoRedondo}
          aria-label={t("Desfazer")}
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={refazer}
          disabled={futuro.length === 0}
          className={botaoRedondo}
          aria-label={t("Refazer")}
        >
          <Redo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => void salvar()}
          disabled={salvando}
          className={botaoRedondo}
          aria-label={t("Salvar")}
          data-testid="chatbot-salvar"
        >
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        </button>
        <span className="ml-2 flex items-center gap-1.5 text-sm" data-testid="chatbot-estado">
          {sujo ? (
            <>
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              {t("Alterações não salvas")}
            </>
          ) : (
            <span className="text-muted-foreground">{t("Tudo salvo")}</span>
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
                if (doGrupo.length === 0) return null;
                const IconeGrupo = ICONE_DO_GRUPO[grupo.id];
                return (
                  <section key={grupo.id} className="mb-5 last:mb-0">
                    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
                      {IconeGrupo ? <IconeGrupo className="h-4 w-4" /> : null}
                      {t(grupo.nome)}
                    </h3>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {doGrupo.map((p) => (
                        <button
                          key={p.tipo}
                          type="button"
                          draggable
                          onDragStart={(ev) => {
                            ev.dataTransfer.setData(ARRASTO, p.tipo);
                            ev.dataTransfer.effectAllowed = "move";
                          }}
                          onClick={() => adicionar(p.tipo)}
                          className="rounded-xl border border-border bg-background p-3 text-left transition-colors hover:border-primary/60 hover:bg-surface-elevated"
                          data-testid={`menu-passo-${p.tipo}`}
                        >
                          <span className="flex items-center gap-2 text-sm font-semibold">
                            <IconeDoPasso nome={p.icone} className={`h-4 w-4 ${p.cor}`} />
                            {t(p.nome)}
                          </span>
                          <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                            {t(p.descricao)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                );
              })}
              {passosFiltrados.length === 0 ? (
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
            adicionar(tipo, screenToFlowPosition({ x: ev.clientX, y: ev.clientY }));
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
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
            onNodeClick={(_, n) => setSelecionado(n.id)}
            onPaneClick={() => {
              setSelecionado(null);
              setMenuAberto(false);
            }}
            defaultEdgeOptions={{ animated: true }}
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
        </div>

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
