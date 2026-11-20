"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, GitBranch, Circle, Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";

type Flow = {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "active" | "archived";
  is_active: boolean;
  trigger_channel: string | null;
  created_at: string;
  updated_at: string;
};

const STATUS_LABEL: Record<Flow["status"], string> = {
  draft: "Rascunho",
  active: "Ativo",
  archived: "Arquivado",
};

const STATUS_COLOR: Record<Flow["status"], string> = {
  draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  active: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  archived: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export function ChatbotsList({
  flows: initial,
  satisfacao = {},
}: {
  flows: Flow[];
  orgId: string;
  /** Média (escala de 5) e quantidade de notas dos últimos 30 dias, por fluxo. */
  satisfacao?: Record<string, { media: number; total: number }>;
}) {
  const router = useRouter();
  const t = useT();
  const tagDeData = useTagDeIdioma();
  const [flows] = useState(initial);
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [criando, setCriando] = useState(false);

  async function criarFluxo() {
    if (!nome.trim()) return;
    setCriando(true);
    try {
      const res = await fetch("/api/v1/chatbot-flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nome.trim(), description: descricao.trim() || undefined }),
      });
      const json = await res.json();
      if (res.ok && json.data) {
        setOpen(false);
        setNome("");
        setDescricao("");
        router.push(`/app/ai/chatbots/${json.data.id}`);
      }
    } finally {
      setCriando(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Chatbots</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Fluxos automáticos sem custo de IA — triagem, FAQ e desvios antes do agente.")}
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Novo chatbot
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo chatbot</DialogTitle>
              <DialogDescription>
                {t("Dê um nome para o fluxo. Você vai montar as perguntas e respostas no canvas.")}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="nome">Nome</Label>
                <Input
                  id="nome"
                  placeholder="Ex: Triagem inicial, FAQ de suporte…"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && criarFluxo()}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="descricao">{t("Descrição (opcional)")}</Label>
                <Textarea
                  id="descricao"
                  placeholder={t("Para que serve este chatbot?")}
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={criarFluxo} disabled={!nome.trim() || criando}>
                {criando ? "Criando…" : "Criar e editar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Lista vazia */}
      {flows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <GitBranch aria-hidden="true" className="w-12 h-12 text-muted-foreground/40" />
          <p className="text-lg font-medium text-muted-foreground">{t("Nenhum chatbot ainda")}</p>
          <p className="text-sm text-muted-foreground max-w-xs">
            {t("Crie um fluxo visual de perguntas e respostas — sem custo de IA, sem tokens.")}
          </p>
          <Button className="mt-2" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Criar primeiro chatbot
          </Button>
        </div>
      )}

      {/* Grid de cards */}
      {flows.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {flows.map((flow) => (
            <Card
              key={flow.id}
              className="group cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => router.push(`/app/ai/chatbots/${flow.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <GitBranch className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <CardTitle className="text-base truncate">{flow.name}</CardTitle>
                  </div>
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[flow.status]}`}
                  >
                    {STATUS_LABEL[flow.status]}
                  </span>
                </div>
                {flow.description && (
                  <CardDescription className="line-clamp-2 text-xs mt-1">
                    {flow.description}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    {flow.is_active ? (
                      <>
                        <Circle className="w-2 h-2 fill-green-500 text-green-500" />
                        Ligado
                      </>
                    ) : (
                      <>
                        <Circle className="w-2 h-2 fill-gray-400 text-gray-400" />
                        Desligado
                      </>
                    )}
                  </span>
                  <span>
                    Atualizado{" "}
                    {new Date(flow.updated_at).toLocaleDateString(tagDeData, {
                      day: "2-digit",
                      month: "short",
                    })}
                  </span>
                </div>
                {satisfacao[flow.id] ? (
                  <div
                    className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"
                    data-testid="satisfacao-do-fluxo"
                  >
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-500" aria-hidden />
                    <span className="font-medium text-foreground">
                      {satisfacao[flow.id]!.media.toLocaleString(tagDeData, {
                        maximumFractionDigits: 1,
                        minimumFractionDigits: 1,
                      })}
                    </span>
                    <span>
                      · {satisfacao[flow.id]!.total}{" "}
                      {satisfacao[flow.id]!.total === 1
                        ? t("avaliação nos últimos 30 dias")
                        : t("avaliações nos últimos 30 dias")}
                    </span>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
