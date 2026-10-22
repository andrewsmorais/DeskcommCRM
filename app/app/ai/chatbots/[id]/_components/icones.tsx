"use client";

/**
 * Nome de ícone do catálogo (`lib/chatbot/passos.ts`) → componente. O catálogo
 * guarda só o NOME porque também é lido pelo motor, que roda no worker e não
 * carrega React.
 */
import {
  CalendarDays,
  Check,
  CircleDot,
  Clock,
  Flag,
  GitBranch,
  Headset,
  ListChecks,
  MessageCircle,
  MessageSquareText,
  Play,
  Search,
  StickyNote,
  Tag,
  TextCursorInput,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

const ICONES: Record<string, LucideIcon> = {
  CalendarDays,
  Check,
  Clock,
  Headset,
  ListChecks,
  MessageCircle,
  MessageSquareText,
  Search,
  StickyNote,
  Tag,
  TextCursorInput,
  Users,
};

/** Ícone do cabeçalho de cada grupo do menu, como na Umbler. */
export const ICONE_DO_GRUPO: Record<string, LucideIcon> = {
  inicio: Play,
  condicao: GitBranch,
  acao: Zap,
  finalizacao: Flag,
  utilitarios: Wrench,
};

export function IconeDoPasso({ nome, className }: { nome: string; className?: string }) {
  const Icone = ICONES[nome] ?? CircleDot;
  return <Icone className={className} aria-hidden />;
}
