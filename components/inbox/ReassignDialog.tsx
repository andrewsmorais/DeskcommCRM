"use client";
import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { channelLabel, useChannelSessions } from "@/hooks/channels/useChannelSessions";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useContinuarPorOutroNumero } from "@/hooks/inbox/useContinuarPorOutroNumero";
import { useTransferConversation } from "@/hooks/inbox/useTransferConversation";
import { useMudarSetorDaConversa, useSetores } from "@/hooks/inbox/useSetores";
import { outrosNumerosDoContato } from "@/lib/inbox/outros-numeros";

export type AbaDeTransferencia = "atendente" | "setor" | "numero";

/** Valor do seletor que tira a conversa do setor (o Select não aceita "" como item). */
const SEM_SETOR = "__sem_setor__";

interface Props {
  conversationId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Aba em que o diálogo abre. A faixa de número fora do ar abre em "numero". */
  abaInicial?: AbaDeTransferencia;
  /** Setor atual da conversa (migration 0496); habilita "Tirar do setor". */
  setorAtual?: string | null;
  /**
   * O que a aba Número precisa. Sem `numero`, a aba não aparece — é o caso de
   * quem chama o diálogo fora do Inbox. Com `numero`, ela aparece sempre que há
   * outro número com telefone, inclusive numa conversa de rede social cujo
   * contato tem telefone salvo: continuar pelo WhatsApp é justamente a saída.
   */
  numero?: {
    contactId: string;
    contactPhone: string | null;
    channelSessionId: string;
    /** Selecionar a conversa aberta no outro número (a seleção do Inbox é estado local). */
    onAbrirConversa: (id: string) => void;
  };
}

const ROLE_LABEL: Record<string, string> = {
  agent: "Atendente",
  manager: "Gestor",
  admin: "Admin",
};

/**
 * G3-01 — transferência imediata (decisão G1-06d): reatribui a conversa a
 * outro atendente da org, com motivo opcional. Cada transferência vira evento
 * auditável em conversation_assignment_events.
 *
 * A aba Número responde à outra metade de "transferir": continuar o atendimento
 * do mesmo contato por outro número da organização — o caso de quando o
 * telefone desta conversa cai e não havia por onde responder.
 */
export function ReassignDialog({
  conversationId,
  open,
  onOpenChange,
  abaInicial = "atendente",
  setorAtual = null,
  numero,
}: Props) {
  const t = useT();
  const { user } = useAuth();
  const members = useAssignableMembers(open);
  const transfer = useTransferConversation();
  const continuar = useContinuarPorOutroNumero();
  const { data: sessoes } = useChannelSessions({ enabled: open && numero != null });
  const [toUserId, setToUserId] = useState<string>("");
  const [reason, setReason] = useState("");
  const [aba, setAba] = useState<AbaDeTransferencia>(abaInicial);
  const [paraSessao, setParaSessao] = useState<string>("");
  const { data: setores } = useSetores(open);
  const mudarSetor = useMudarSetorDaConversa();
  const [paraSetor, setParaSetor] = useState<string>("");

  const options = (members.data ?? []).filter((m) => m.user_id !== user.id);
  const numeros = numero ? outrosNumerosDoContato(sessoes, numero.channelSessionId) : [];
  const temAbaNumero = numero != null && numeros.length > 0;
  const temAbaSetor = (setores?.length ?? 0) > 0;
  const abaAtual =
    (aba === "numero" && !temAbaNumero) || (aba === "setor" && !temAbaSetor) ? "atendente" : aba;
  const abas = 1 + (temAbaSetor ? 1 : 0) + (temAbaNumero ? 1 : 0);

  function close(v: boolean) {
    if (!v) {
      setToUserId("");
      setReason("");
      setParaSessao("");
      setParaSetor("");
      setAba(abaInicial);
    }
    onOpenChange(v);
  }

  function enviarAoSetor() {
    if (!paraSetor) return;
    mudarSetor.mutate(
      { conversation_id: conversationId, setor_id: paraSetor === SEM_SETOR ? null : paraSetor },
      { onSuccess: () => close(false) },
    );
  }

  function continuarPeloNumero() {
    if (!numero || !paraSessao) return;
    continuar.mutate(
      { contact_id: numero.contactId, channel_session_id: paraSessao },
      {
        onSuccess: (id) => {
          close(false);
          numero.onAbrirConversa(id);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("Transferir conversa")}</DialogTitle>
          <DialogDescription>
            {t(
              "A transferência é imediata: o atendente escolhido vira o responsável agora e a mudança fica registrada no histórico.",
            )}
          </DialogDescription>
        </DialogHeader>

        {abas > 1 && (
          <Tabs value={abaAtual} onValueChange={(v) => setAba(v as AbaDeTransferencia)}>
            <TabsList className={abas === 3 ? "grid w-full grid-cols-3" : "grid w-full grid-cols-2"}>
              <TabsTrigger value="atendente">{t("Atendente")}</TabsTrigger>
              {temAbaSetor && (
                <TabsTrigger value="setor" data-testid="aba-transferir-setor">
                  {t("Setor")}
                </TabsTrigger>
              )}
              {temAbaNumero && (
                <TabsTrigger value="numero" data-testid="aba-transferir-numero">
                  {t("Número")}
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>
        )}

        {abaAtual === "setor" ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reassign-setor">{t("Enviar para o setor")}</Label>
              <Select value={paraSetor} onValueChange={setParaSetor}>
                <SelectTrigger id="reassign-setor" className="w-full" data-testid="select-setor">
                  <SelectValue placeholder={t("Escolha o setor")} />
                </SelectTrigger>
                <SelectContent>
                  {(setores ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id} disabled={s.id === setorAtual}>
                      {s.nome}
                      {s.id === setorAtual && (
                        <span className="ml-1 text-muted-foreground">· {t("atual")}</span>
                      )}
                    </SelectItem>
                  ))}
                  {setorAtual && <SelectItem value={SEM_SETOR}>{t("Tirar do setor")}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              {paraSetor === SEM_SETOR
                ? t("A conversa perde a marca do setor. Quem está com ela continua com ela.")
                : t(
                    "A conversa vai para a fila do setor e só quem é do setor a recebe. Se o responsável atual não for do setor, ela volta para a fila.",
                  )}
            </p>
          </div>
        ) : abaAtual === "numero" && numero ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reassign-numero">{t("Continuar pelo número")}</Label>
              <Select value={paraSessao} onValueChange={setParaSessao}>
                <SelectTrigger id="reassign-numero" className="w-full" data-testid="select-outro-numero">
                  <SelectValue placeholder={t("Escolha o número")} />
                </SelectTrigger>
                <SelectContent>
                  {numeros.map((n) => (
                    <SelectItem key={n.id} value={n.id} disabled={!n.conectado}>
                      {channelLabel(n, t)}
                      <span className="ml-1 text-muted-foreground">
                        · {n.conectado ? t("Conectado") : t("Desconectado")}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {numero.contactPhone ? (
              <p className="text-xs text-muted-foreground">
                {t(
                  "O cliente passa a receber as mensagens pelo número escolhido. Se a conversa lá estiver livre, você fica como responsável. O histórico deste número continua nesta conversa.",
                )}
              </p>
            ) : (
              <p className="text-xs text-destructive" role="status">
                {t("Este contato não tem telefone salvo, então não dá para falar com ele por outro número.")}
              </p>
            )}
          </div>
        ) : (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reassign-target">{t("Transferir para")}</Label>
            <Select value={toUserId} onValueChange={setToUserId}>
              <SelectTrigger id="reassign-target" className="w-full">
                <SelectValue
                  placeholder={members.isLoading ? t("Carregando atendentes…") : t("Escolha o atendente")}
                />
              </SelectTrigger>
              <SelectContent>
                {options.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.full_name ?? `${t("Atendente")} ${m.user_id.slice(0, 8)}`}
                    <span className="ml-1 text-muted-foreground">
                      · {t(ROLE_LABEL[m.role] ?? m.role)}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!members.isLoading && options.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {t("Nenhum outro atendente disponível nesta organização.")}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reassign-reason">{t("Motivo (opcional)")}</Label>
            <Textarea
              id="reassign-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("Ex.: cliente pediu falar com o financeiro")}
              maxLength={500}
              rows={2}
            />
          </div>
        </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => close(false)}>
            {t("Cancelar")}
          </Button>
          {abaAtual === "setor" ? (
            <Button
              disabled={!paraSetor || mudarSetor.isPending}
              onClick={enviarAoSetor}
              data-testid="btn-enviar-ao-setor"
            >
              {mudarSetor.isPending ? t("Transferindo…") : t("Transferir")}
            </Button>
          ) : abaAtual === "numero" ? (
            <Button
              disabled={!paraSessao || !numero?.contactPhone || continuar.isPending}
              onClick={continuarPeloNumero}
              data-testid="btn-continuar-pelo-numero"
            >
              {continuar.isPending ? t("Abrindo…") : t("Continuar por este número")}
            </Button>
          ) : (
          <Button
            disabled={!toUserId || transfer.isPending}
            onClick={() =>
              transfer.mutate(
                {
                  conversation_id: conversationId,
                  to_user_id: toUserId,
                  reason: reason.trim() || undefined,
                },
                { onSuccess: () => close(false) },
              )
            }
          >
            {transfer.isPending ? t("Transferindo…") : t("Transferir")}
          </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
