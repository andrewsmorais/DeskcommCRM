"use client";

/**
 * Tipos de nó do canvas de chatbot.
 * Cada nó é um React component que o React Flow renderiza no canvas.
 */

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import {
  MessageSquare,
  GitBranch,
  ArrowRightLeft,
  CircleStop,
  Play,
} from "lucide-react";

// ─── tipos compartilhados ───────────────────────────────────────────────────

export type NodeData = {
  label: string;
  [key: string]: unknown;
};

// ─── node: Start ───────────────────────────────────────────────────────────

export const StartNode = memo(function StartNode({ data, selected }: NodeProps) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full px-4 py-2 bg-green-500 text-white shadow-md text-sm font-semibold ${
        selected ? "ring-2 ring-green-300 ring-offset-1" : ""
      }`}
    >
      <Play className="w-4 h-4 fill-white" />
      <span>{(data as NodeData).label || "Início"}</span>
      <Handle type="source" position={Position.Bottom} className="!bg-white !border-green-600" />
    </div>
  );
});

// ─── node: Message ─────────────────────────────────────────────────────────

export const MessageNode = memo(function MessageNode({ data, selected }: NodeProps) {
  const d = data as NodeData & { message?: string };
  return (
    <div
      className={`rounded-xl border bg-card shadow-sm min-w-[200px] max-w-[280px] ${
        selected ? "ring-2 ring-primary ring-offset-1" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-primary !border-primary/60" />
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/40 rounded-t-xl">
        <MessageSquare className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="text-xs font-medium text-primary">Mensagem</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
          {d.message || (
            <span className="italic opacity-60">Clique para editar a mensagem…</span>
          )}
        </p>
        {d.label && d.label !== "Mensagem" && (
          <p className="text-[11px] font-medium mt-1.5 text-foreground truncate">{d.label}</p>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-primary !border-primary/60" />
    </div>
  );
});

// ─── node: Condition ───────────────────────────────────────────────────────

export const ConditionNode = memo(function ConditionNode({ data, selected }: NodeProps) {
  const d = data as NodeData & { question?: string; options?: string[] };
  const options = d.options ?? ["Sim", "Não"];

  return (
    <div
      className={`rounded-xl border bg-card shadow-sm min-w-[200px] max-w-[280px] ${
        selected ? "ring-2 ring-amber-500 ring-offset-1" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-amber-500 !border-amber-600" />
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-amber-50 dark:bg-amber-950/30 rounded-t-xl">
        <GitBranch className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">Condição</span>
      </div>
      <div className="px-3 py-2">
        <p className="text-xs text-foreground font-medium leading-snug line-clamp-3">
          {d.question || (
            <span className="italic text-muted-foreground opacity-60">Qual é a pergunta?</span>
          )}
        </p>
        <div className="flex flex-wrap gap-1 mt-2">
          {options.map((opt, i) => (
            <span
              key={i}
              className="text-[10px] bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded-full"
            >
              {opt}
            </span>
          ))}
        </div>
      </div>
      {/* handles de saída — um por opção, posicionados lateralmente */}
      {options.map((opt, i) => (
        <Handle
          key={opt}
          id={`option-${i}`}
          type="source"
          position={Position.Bottom}
          style={{ left: `${((i + 1) / (options.length + 1)) * 100}%` }}
          className="!bg-amber-500 !border-amber-600"
          title={opt}
        />
      ))}
    </div>
  );
});

// ─── node: Transfer ────────────────────────────────────────────────────────

export const TransferNode = memo(function TransferNode({ data, selected }: NodeProps) {
  const d = data as NodeData & { team?: string; message?: string };
  return (
    <div
      className={`rounded-xl border bg-card shadow-sm min-w-[200px] max-w-[280px] ${
        selected ? "ring-2 ring-blue-500 ring-offset-1" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-blue-500 !border-blue-600" />
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-blue-50 dark:bg-blue-950/30 rounded-t-xl">
        <ArrowRightLeft className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0" />
        <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Transferir</span>
      </div>
      <div className="px-3 py-2">
        {d.team ? (
          <p className="text-xs font-medium">
            Para: <span className="text-blue-600 dark:text-blue-400">{d.team}</span>
          </p>
        ) : (
          <p className="text-xs italic text-muted-foreground opacity-60">Escolher destino…</p>
        )}
        {d.message && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{d.message}</p>
        )}
      </div>
    </div>
  );
});

// ─── node: End ─────────────────────────────────────────────────────────────

export const EndNode = memo(function EndNode({ data, selected }: NodeProps) {
  const d = data as NodeData & { message?: string };
  return (
    <div
      className={`rounded-xl border bg-card shadow-sm min-w-[160px] max-w-[240px] ${
        selected ? "ring-2 ring-red-400 ring-offset-1" : "border-border"
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-red-400 !border-red-500" />
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-red-50 dark:bg-red-950/30 rounded-t-xl">
        <CircleStop className="w-3.5 h-3.5 text-red-500 dark:text-red-400 shrink-0" />
        <span className="text-xs font-medium text-red-600 dark:text-red-300">Encerrar</span>
      </div>
      {d.message && (
        <div className="px-3 py-2">
          <p className="text-xs text-muted-foreground line-clamp-3">{d.message}</p>
        </div>
      )}
    </div>
  );
});

// ─── mapa de node types para o ReactFlow ──────────────────────────────────

export const NODE_TYPES = {
  start: StartNode,
  message: MessageNode,
  condition: ConditionNode,
  transfer: TransferNode,
  end: EndNode,
} as const;

export type NodeType = keyof typeof NODE_TYPES;

export const NODE_TYPE_META: Record<NodeType, { label: string; icon: React.ElementType; color: string }> = {
  start: { label: "Início", icon: Play, color: "text-green-600 dark:text-green-400" },
  message: { label: "Mensagem", icon: MessageSquare, color: "text-primary" },
  condition: { label: "Condição", icon: GitBranch, color: "text-amber-600 dark:text-amber-400" },
  transfer: { label: "Transferir", icon: ArrowRightLeft, color: "text-blue-600 dark:text-blue-400" },
  end: { label: "Encerrar", icon: CircleStop, color: "text-red-500 dark:text-red-400" },
};
