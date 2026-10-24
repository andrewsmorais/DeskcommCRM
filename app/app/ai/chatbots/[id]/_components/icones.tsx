"use client";

/**
 * Nome de ícone do catálogo (`lib/chatbot/passos.ts`) → componente. O catálogo
 * guarda só o NOME porque também é lido pelo motor, que roda no worker e não
 * carrega React.
 */
import {
  Activity,
  AlarmClock,
  Ban,
  BellRing,
  CalendarCheck,
  CalendarDays,
  Check,
  CircleDot,
  Clock,
  Flag,
  GitBranch,
  Hand,
  Headset,
  Hourglass,
  Kanban,
  ListChecks,
  MessageCircle,
  MessageSquareQuote,
  MessageSquareText,
  Network,
  NotebookPen,
  Paperclip,
  Play,
  Plug,
  Repeat,
  Search,
  Shuffle,
  Sparkles,
  Split,
  Star,
  StickyNote,
  Tag,
  TextCursorInput,
  UserCheck,
  UserPen,
  UserX,
  Users,
  Webhook,
  Workflow,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

const ICONES: Record<string, LucideIcon> = {
  Activity,
  AlarmClock,
  Ban,
  BellRing,
  CalendarCheck,
  CalendarDays,
  Check,
  Clock,
  GitBranch,
  Hand,
  Headset,
  Hourglass,
  Kanban,
  ListChecks,
  MessageCircle,
  MessageSquareQuote,
  MessageSquareText,
  Network,
  NotebookPen,
  Paperclip,
  Repeat,
  Search,
  Shuffle,
  Sparkles,
  Split,
  Star,
  StickyNote,
  Tag,
  TextCursorInput,
  UserCheck,
  UserPen,
  UserX,
  Users,
  Webhook,
  Workflow,
  Zap,
};

/** Ícone do cabeçalho de cada grupo do menu, como na Umbler. */
export const ICONE_DO_GRUPO: Record<string, LucideIcon> = {
  inicio: Play,
  condicao: GitBranch,
  acao: Zap,
  finalizacao: Flag,
  integracao: Plug,
  utilitarios: Wrench,
};

export function IconeDoPasso({ nome, className }: { nome: string; className?: string }) {
  const Icone = ICONES[nome] ?? CircleDot;
  return <Icone className={className} aria-hidden />;
}
