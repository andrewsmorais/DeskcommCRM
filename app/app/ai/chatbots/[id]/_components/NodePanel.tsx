"use client";

/**
 * Painel lateral para editar o nó selecionado no canvas.
 * Renderiza campos diferentes de acordo com o node_type.
 */

import { type Node } from "@xyflow/react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { NODE_TYPE_META, type NodeType } from "./node-types";

type NodeData = Record<string, unknown>;

type Props = {
  node: Node<NodeData>;
  onClose: () => void;
  onChange: (id: string, data: Partial<NodeData>) => void;
  onDelete: (id: string) => void;
};

export function NodePanel({ node, onClose, onChange, onDelete }: Props) {
  const t = useT();
  const type = node.type as NodeType;
  const meta = NODE_TYPE_META[type];
  const data = node.data;
  const Icon = meta?.icon;

  function set(key: string, value: unknown) {
    onChange(node.id, { [key]: value });
  }

  return (
    <div className="flex flex-col h-full">
      {/* cabeçalho */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          {Icon && <Icon className={`w-4 h-4 ${meta.color}`} />}
          <span className="text-sm font-medium">{meta?.label ?? type}</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* campos */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* label (todos os tipos, exceto start) */}
        {type !== "start" && (
          <div className="space-y-1.5">
            <Label className="text-xs">{t("Título do nó")}</Label>
            <Input
              placeholder="Nome interno (opcional)"
              value={(data.label as string) ?? ""}
              onChange={(e) => set("label", e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Aparece como identificador no canvas.
            </p>
          </div>
        )}

        {/* ── message ──────────────────────────────────────── */}
        {type === "message" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Texto da mensagem</Label>
            <Textarea
              placeholder={t("Digite a mensagem que será enviada ao contato…")}
              rows={5}
              value={(data.message as string) ?? ""}
              onChange={(e) => set("message", e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              {t("Suporta emojis e quebras de linha. Variáveis:")} {"{nome}"}, {"{telefone}"}.
            </p>
          </div>
        )}

        {/* ── condition ────────────────────────────────────── */}
        {type === "condition" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Pergunta</Label>
              <Textarea
                placeholder={t("Qual é a sua dúvida hoje?")}
                rows={3}
                value={(data.question as string) ?? ""}
                onChange={(e) => set("question", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Opções (uma por linha)")}</Label>
              <Textarea
                placeholder={t("Suporte técnico\nFinanceiro\nVendas")}
                rows={4}
                value={((data.options as string[]) ?? ["Sim", "Não"]).join("\n")}
                onChange={(e) =>
                  set(
                    "options",
                    e.target.value
                      .split("\n")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  )
                }
              />
              <p className="text-[11px] text-muted-foreground">
                {t("Cada linha vira uma opção numerada no WhatsApp.")}
              </p>
            </div>
          </>
        )}

        {/* ── transfer ─────────────────────────────────────── */}
        {type === "transfer" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Destino</Label>
              <Input
                placeholder="Nome da equipe ou agente"
                value={(data.team as string) ?? ""}
                onChange={(e) => set("team", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("Mensagem de transição (opcional)")}</Label>
              <Textarea
                placeholder={t("Aguarde, vou te transferir para um atendente…")}
                rows={3}
                value={(data.message as string) ?? ""}
                onChange={(e) => set("message", e.target.value)}
              />
            </div>
          </>
        )}

        {/* ── end ──────────────────────────────────────────── */}
        {type === "end" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Mensagem de encerramento (opcional)</Label>
            <Textarea
              placeholder={t("Obrigado pelo contato! Até a próxima 😊")}
              rows={4}
              value={(data.message as string) ?? ""}
              onChange={(e) => set("message", e.target.value)}
            />
          </div>
        )}
      </div>

      {/* rodapé */}
      {type !== "start" && (
        <div className="px-4 py-3 border-t">
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => onDelete(node.id)}
          >
            {t("Remover nó")}
          </Button>
        </div>
      )}
    </div>
  );
}
