"use client";

/**
 * Nome de ícone do catálogo (`lib/chatbot/passos.ts`) → componente. O catálogo
 * guarda só o NOME porque também é lido pelo motor, que roda no worker e não
 * carrega React.
 */
import {
  AlarmClock,
  BellRing,
  CalendarDays,
  Check,
  CircleDot,
  Clock,
  Flag,
  GitBranch,
  Headset,
  Hourglass,
  ListChecks,
  MessageCircle,
  MessageSquareQuote,
  MessageSquareText,
  Network,
  NotebookPen,
  Play,
  Search,
  Split,
  Star,
  StickyNote,
  Tag,
  TextCursorInput,
  UserPen,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

const ICONES: Record<string, LucideIcon> = {
  AlarmClock,
  BellRing,
  CalendarDays,
  Check,
  Clock,
  Headset,
  Hourglass,
  ListChecks,
  MessageCircle,
  MessageSquareQuote,
  MessageSquareText,
  Network,
  NotebookPen,
  Search,
  Split,
  Star,
  StickyNote,
  Tag,
  TextCursorInput,
  UserPen,
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
