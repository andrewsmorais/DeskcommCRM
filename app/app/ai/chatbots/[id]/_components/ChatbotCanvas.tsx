"use client";

/**
 * Canvas principal do chatbot builder.
 * Drag & drop de nós, conexão por arestas, edição lateral, auto-save.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  MessageSquare,
  GitBranch,
  ArrowRightLeft,
  CircleStop,
  Save,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

import { useT } from "@/hooks/i18n/useT";

import { NODE_TYPES, type NodeType, type NodeData } from "./node-types";
import { NodePanel } from "./NodePanel";

// ─── types ──────────────────────────────────────────────────────────────────

type Flow = {
  id: string;
  name: string;
  status: "draft" | "active" | "archived";
  is_active: boolean;
  nodes: DbNode[];
  edges: DbEdge[];
};

type DbNode = {
  id: string;
  node_type: string;
  label: string;
  pos_x: number;
  pos_y: number;
  data: Record<string, unknown>;
};

type DbEdge = {
  id: string;
  source_node_id: string;
  target_node_id: string;
  source_handle: string | null;
  target_handle: string | null;
  label: string | null;
};

// ─── helpers ────────────────────────────────────────────────────────────────

function dbNodesToRF(nodes: DbNode[]): Node<NodeData>[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.node_type as NodeType,
    position: { x: n.pos_x, y: n.pos_y },
    data: { label: n.label, ...n.data } as NodeData,
  }));
}

function dbEdgesToRF(edges: DbEdge[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source_node_id,
    target: e.target_node_id,
    sourceHandle: e.source_handle ?? undefined,
    targetHandle: e.target_handle ?? undefined,
    label: e.label ?? undefined,
    animated: true,
  }));
}

function rfNodesToDb(nodes: Node<NodeData>[]) {
  return nodes.map((n) => {
    const { label, ...rest } = n.data;
    return {
      id: n.id,
      node_type: n.type ?? "message",
      label: (label as string) ?? "",
      pos_x: n.position.x,
      pos_y: n.position.y,
      data: rest,
    };
  });
}

function rfEdgesToDb(edges: Edge[]) {
  return edges.map((e) => ({
    id: e.id,
    source_node_id: e.source,
    target_node_id: e.target,
    source_handle: e.sourceHandle ?? null,
    target_handle: e.targetHandle ?? null,
    label: (e.label as string) ?? null,
  }));
}

const TOOLS: { type: NodeType; icon: React.ElementType; label: string; color: string }[] = [
  { type: "message", icon: MessageSquare, label: "Mensagem", color: "text-primary" },
  { type: "condition", icon: GitBranch, label: "Condição", color: "text-amber-600 dark:text-amber-400" },
  { type: "transfer", icon: ArrowRightLeft, label: "Transferir", color: "text-blue-600 dark:text-blue-400" },
  { type: "end", icon: CircleStop, label: "Encerrar", color: "text-red-500 dark:text-red-400" },
];

// ─── component ──────────────────────────────────────────────────────────────

type SaveState = "idle" | "saving" | "saved" | "error";

export function ChatbotCanvas({ flow: initial }: { flow: Flow }) {
  const t = useT();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<NodeData>>(
    dbNodesToRF(initial.nodes),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(dbEdgesToRF(initial.edges));
  const [selectedNode, setSelectedNode] = useState<Node<NodeData> | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [flowName] = useState(initial.name);
  const [isActive, setIsActive] = useState(initial.is_active);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inicializa com nó de início se vazio — roda só na montagem
  useEffect(() => {
    if (nodes.length === 0) {
      setNodes([
        {
          id: "start-1",
          type: "start",
          position: { x: 250, y: 80 },
          data: { label: "Início" },
          deletable: false,
        },
      ]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── save ────────────────────────────────────────────────────────────────

  const save = useCallback(
    async (currentNodes: Node<NodeData>[], currentEdges: Edge[]) => {
      setSaveState("saving");
      try {
        const res = await fetch(`/api/v1/chatbot-flows/${initial.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nodes: rfNodesToDb(currentNodes),
            edges: rfEdgesToDb(currentEdges),
          }),
        });
        setSaveState(res.ok ? "saved" : "error");
        if (res.ok) setTimeout(() => setSaveState("idle"), 2000);
      } catch {
        setSaveState("error");
      }
    },
    [initial.id],
  );

  // auto-save com debounce de 1.5s
  const scheduleAutoSave = useCallback(
    (n: Node<NodeData>[], e: Edge[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => save(n, e), 1500);
    },
    [save],
  );

  // ── handlers ────────────────────────────────────────────────────────────

  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdges = addEdge({ ...connection, animated: true }, edges);
      setEdges(newEdges);
      scheduleAutoSave(nodes, newEdges);
    },
    [edges, nodes, setEdges, scheduleAutoSave],
  );

  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes);
      // não auto-salva para "select" — só para move/remove
      const hasSubstantial = changes.some(
        (c) => c.type === "position" || c.type === "remove" || c.type === "add",
      );
      if (hasSubstantial) {
        // pegar estado atualizado após next tick
        setTimeout(() => {
          setNodes((n) => {
            scheduleAutoSave(n, edges);
            return n;
          });
        }, 0);
      }
    },
    [onNodesChange, edges, scheduleAutoSave, setNodes],
  );

  const addNode = useCallback(
    (type: NodeType) => {
      const id = crypto.randomUUID();
      const defaultLabels: Record<NodeType, string> = {
        start: "Início",
        message: "Mensagem",
        condition: "Condição",
        transfer: "Transferir",
        end: "Encerrar",
      };
      const newNode: Node<NodeData> = {
        id,
        type,
        position: { x: 100 + Math.random() * 300, y: 200 + Math.random() * 200 },
        data: { label: defaultLabels[type] },
      };
      setNodes((prev) => {
        const updated = [...prev, newNode];
        scheduleAutoSave(updated, edges);
        return updated;
      });
    },
    [edges, setNodes, scheduleAutoSave],
  );

  const updateNodeData = useCallback(
    (id: string, data: Partial<NodeData>) => {
      setNodes((prev) => {
        const updated = prev.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...data } } : n,
        );
        scheduleAutoSave(updated, edges);
        return updated;
      });
      setSelectedNode((prev) => (prev?.id === id ? { ...prev, data: { ...prev.data, ...data } } : prev));
    },
    [edges, setNodes, scheduleAutoSave],
  );

  const deleteNode = useCallback(
    (id: string) => {
      setNodes((prev) => {
        const updated = prev.filter((n) => n.id !== id);
        const updatedEdges = edges.filter((e) => e.source !== id && e.target !== id);
        setEdges(updatedEdges);
        scheduleAutoSave(updated, updatedEdges);
        return updated;
      });
      setSelectedNode(null);
    },
    [edges, setEdges, setNodes, scheduleAutoSave],
  );

  async function toggleActive() {
    const next = !isActive;
    setIsActive(next);
    await fetch(`/api/v1/chatbot-flows/${initial.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_active: next, status: next ? "active" : "draft" }),
    });
  }

  // ── render ──────────────────────────────────────────────────────────────

  const SaveIcon =
    saveState === "saving"
      ? Loader2
      : saveState === "saved"
        ? CheckCircle2
        : saveState === "error"
          ? AlertCircle
          : Save;

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        {/* ── Sidebar de ferramentas ─────────────────────── */}
        <aside className="w-56 border-r bg-card flex flex-col shrink-0">
          {/* voltar */}
          <div className="px-3 py-3 border-b">
            <Link
              href="/app/ai/chatbots"
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Chatbots
            </Link>
            <p className="mt-1.5 text-sm font-medium line-clamp-2">{flowName}</p>
          </div>

          {/* blocos */}
          <div className="px-3 py-3 flex-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-2">
              Adicionar bloco
            </p>
            <div className="space-y-1">
              {TOOLS.map((tool) => {
                const Icon = tool.icon;
                return (
                  <Tooltip key={tool.type}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => addNode(tool.type)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm hover:bg-muted transition-colors text-left"
                      >
                        <Icon className={`w-4 h-4 shrink-0 ${tool.color}`} />
                        <span>{tool.label}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="text-xs">
                      {t("Arraste ou clique para adicionar")}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>

          {/* rodapé com status */}
          <div className="px-3 py-3 border-t space-y-2">
            <button
              onClick={toggleActive}
              className={`w-full text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                isActive
                  ? "bg-green-100 text-green-800 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-300"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {isActive ? "● Chatbot ativo" : "○ Chatbot inativo"}
            </button>
            <button
              onClick={() => save(nodes, edges)}
              disabled={saveState === "saving"}
              className="w-full flex items-center justify-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border hover:bg-muted transition-colors"
            >
              <SaveIcon
                className={`w-3.5 h-3.5 ${saveState === "saving" ? "animate-spin" : saveState === "saved" ? "text-green-600" : saveState === "error" ? "text-red-500" : ""}`}
              />
              {saveState === "saving"
                ? t("Salvando…")
                : saveState === "saved"
                  ? t("Salvo!")
                  : saveState === "error"
                    ? t("Erro ao salvar")
                    : t("Salvar agora")}
            </button>
          </div>
        </aside>

        {/* ── Canvas ────────────────────────────────────────── */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={(changes) => {
              onEdgesChange(changes);
              setTimeout(() => {
                setEdges((e) => {
                  scheduleAutoSave(nodes, e);
                  return e;
                });
              }, 0);
            }}
            onConnect={onConnect}
            nodeTypes={NODE_TYPES}
            onNodeClick={(_, node) => setSelectedNode(node as Node<NodeData>)}
            onPaneClick={() => setSelectedNode(null)}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            defaultEdgeOptions={{ animated: true }}
            className="bg-dot-pattern"
          >
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                const colors: Record<string, string> = {
                  start: "#22c55e",
                  message: "hsl(var(--primary))",
                  condition: "#f59e0b",
                  transfer: "#3b82f6",
                  end: "#ef4444",
                };
                return colors[n.type ?? "message"] ?? "#888";
              }}
              pannable
              zoomable
            />
            <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="currentColor" className="text-muted-foreground/20" />
          </ReactFlow>
        </div>

        {/* ── Painel lateral do nó selecionado ──────────────── */}
        {selectedNode && (
          <aside className="w-72 border-l bg-card shrink-0">
            <NodePanel
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
              onChange={updateNodeData}
              onDelete={deleteNode}
            />
          </aside>
        )}
      </div>
    </TooltipProvider>
  );
}
