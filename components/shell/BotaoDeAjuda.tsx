"use client";
/**
 * O botão "Ajuda" do topo: abre um painel com o chat do assistente (quando a
 * instalação tem a chave da ajuda), o WhatsApp e o e-mail de suporte.
 *
 * A conversa vive só nesta aba (estado do componente), como no Pombo: fechar o
 * painel mantém, recarregar a página zera. O servidor recebe as últimas
 * mensagens a cada pergunta — não há histórico guardado do lado do cliente.
 */
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import {
  ChatCircle,
  EnvelopeSimple,
  ImageSquare,
  PaperPlaneTilt,
  Question,
  WhatsappLogo,
  X,
} from "@/lib/ui/icons";

type Turno = { papel: "user" | "assistant"; texto: string; escalou?: boolean; imagem?: string };
type Estado = {
  contato: { email: string; whatsapp: string };
  chat: { disponivel: boolean; restantes: number };
};

const MAX_HISTORICO = 12;
const MAX_BYTES = 3 * 1024 * 1024;
const TIPOS = ["image/jpeg", "image/png", "image/webp"];

function whatsappLegivel(d: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : `+${d}`;
}

/** Texto com blocos ``` vira parágrafos e caixas copiáveis. */
function Texto({ texto }: { texto: string }) {
  const t = useT();
  const partes = texto.split(/```[a-zA-Z]*\n?/);
  return (
    <>
      {partes.map((p, i) =>
        i % 2 === 1 ? (
          <div key={i} className="my-2 rounded-md border border-border bg-background">
            <pre className="max-h-72 overflow-auto p-2 text-xs whitespace-pre-wrap">{p.trim()}</pre>
            <button
              type="button"
              className="w-full border-t border-border px-2 py-1 text-xs font-medium text-primary hover:bg-muted"
              onClick={() => void navigator.clipboard?.writeText(p.trim())}
            >
              {t("Copiar texto")}
            </button>
          </div>
        ) : p.trim() ? (
          <p key={i} className="whitespace-pre-wrap">
            {p.trim()}
          </p>
        ) : null,
      )}
    </>
  );
}

export function BotaoDeAjuda() {
  const t = useT();
  const pathname = usePathname();
  const [aberto, setAberto] = useState(false);
  const [estado, setEstado] = useState<Estado | null>(null);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [texto, setTexto] = useState("");
  const [imagem, setImagem] = useState<{ tipo: string; base64: string; url: string } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto || estado) return;
    fetch("/api/v1/ajuda")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { data?: Estado } | null) => {
        if (j?.data) setEstado(j.data);
        else
          setEstado({
            contato: { email: "", whatsapp: "" },
            chat: { disponivel: false, restantes: 0 },
          });
      })
      .catch(() =>
        setEstado({
          contato: { email: "", whatsapp: "" },
          chat: { disponivel: false, restantes: 0 },
        }),
      );
  }, [aberto, estado]);

  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: "smooth" });
  }, [turnos, enviando]);

  function escolherImagem(f: File | undefined) {
    if (!f) return;
    if (!TIPOS.includes(f.type)) return setErro(t("Envie uma imagem JPG, PNG ou WEBP."));
    if (f.size > MAX_BYTES) return setErro(t("A imagem passa de 3 MB."));
    const leitor = new FileReader();
    leitor.onload = () => {
      const url = String(leitor.result);
      setImagem({ tipo: f.type, base64: url.split(",")[1] ?? "", url });
      setErro(null);
    };
    leitor.readAsDataURL(f);
  }

  async function enviar() {
    const mensagem = texto.trim();
    if (!mensagem || enviando) return;
    const historico = turnos.slice(-MAX_HISTORICO).map((x) => ({ papel: x.papel, texto: x.texto }));
    setTurnos((ts) => [...ts, { papel: "user", texto: mensagem, imagem: imagem?.url }]);
    setTexto("");
    const img = imagem;
    setImagem(null);
    setEnviando(true);
    setErro(null);
    try {
      const r = await fetch("/api/v1/ajuda", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mensagem,
          historico,
          ...(img ? { imagem: { tipo: img.tipo, base64: img.base64 } } : {}),
          ...(pathname?.startsWith("/") ? { tela: pathname.slice(0, 200) } : {}),
        }),
      });
      const j = (await r.json().catch(() => null)) as {
        data?: { resposta: string; escalou: boolean; restantes: number };
        error?: { message?: string };
      } | null;
      if (!r.ok || !j?.data) {
        setErro(j?.error?.message ?? t("Não consegui responder agora. Tente de novo."));
        if (r.status === 429)
          setEstado((e) => (e ? { ...e, chat: { ...e.chat, restantes: 0 } } : e));
        return;
      }
      const d = j.data;
      setTurnos((ts) => [...ts, { papel: "assistant", texto: d.resposta, escalou: d.escalou }]);
      setEstado((e) => (e ? { ...e, chat: { ...e.chat, restantes: d.restantes } } : e));
    } catch {
      setErro(t("Sem conexão. Tente de novo."));
    } finally {
      setEnviando(false);
    }
  }

  const contato = estado?.contato;
  const temContato = Boolean(contato?.email || contato?.whatsapp);
  const chatLigado = Boolean(estado?.chat.disponivel);
  const semMensagens = chatLigado && (estado?.chat.restantes ?? 0) <= 0;
  const ultimoEscalou = turnos.at(-1)?.escalou;

  const contatos = temContato ? (
    <div className="flex flex-wrap gap-2" data-testid="ajuda-contatos">
      {contato?.whatsapp ? (
        <a
          href={`https://wa.me/${contato.whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <WhatsappLogo size={18} aria-hidden /> WhatsApp {whatsappLegivel(contato.whatsapp)}
        </a>
      ) : null}
      {contato?.email ? (
        <a
          href={`mailto:${contato.email}`}
          className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <EnvelopeSimple size={18} aria-hidden /> {contato.email}
        </a>
      ) : null}
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={t("Ajuda")}
        data-testid="botao-ajuda"
        className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:h-9"
      >
        <Question size={18} aria-hidden />
        <span className="hidden lg:inline">{t("Ajuda")}</span>
      </button>
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border p-4">
            <SheetTitle>{t("Ajuda")}</SheetTitle>
            <SheetDescription>
              {chatLigado
                ? t("Tire suas dúvidas com o assistente ou fale com a nossa equipe.")
                : t("Fale com a nossa equipe.")}
            </SheetDescription>
          </SheetHeader>

          {!estado ? (
            <p className="p-4 text-sm text-muted-foreground">{t("Carregando…")}</p>
          ) : !chatLigado ? (
            <div className="flex flex-col gap-3 p-4">
              {contatos ?? (
                <p className="text-sm text-muted-foreground">
                  {t("Os contatos de suporte ainda não foram configurados nesta instalação.")}
                </p>
              )}
            </div>
          ) : (
            <>
              <div
                className="flex-1 space-y-3 overflow-y-auto p-4 text-sm"
                data-testid="ajuda-conversa"
              >
                {turnos.length === 0 ? (
                  <div className="rounded-lg bg-muted p-3">
                    <p className="flex items-center gap-2 font-medium">
                      <ChatCircle size={18} aria-hidden /> {t("Olá! Como posso ajudar?")}
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      {t(
                        "Pergunte como usar qualquer tela do CRM, peça ajuda para escrever o prompt do seu agente ou para montar um chatbot. Se quiser, mande um print da tela.",
                      )}
                    </p>
                  </div>
                ) : null}
                {turnos.map((x, i) => (
                  <div
                    key={i}
                    className={
                      x.papel === "user"
                        ? "ml-8 rounded-lg bg-primary px-3 py-2 text-primary-foreground"
                        : "mr-4 rounded-lg bg-muted px-3 py-2"
                    }
                  >
                    {x.imagem ? (
                      // eslint-disable-next-line @next/next/no-img-element -- print local, data: URL
                      <img
                        src={x.imagem}
                        alt={t("Print enviado")}
                        className="mb-2 max-h-40 rounded"
                      />
                    ) : null}
                    <Texto texto={x.texto} />
                  </div>
                ))}
                {enviando ? <p className="text-muted-foreground">{t("Pensando…")}</p> : null}
                {ultimoEscalou || semMensagens ? (
                  <div className="space-y-2 rounded-lg border border-border p-3">
                    <p className="font-medium">{t("Fale com a nossa equipe")}</p>
                    {contatos}
                  </div>
                ) : null}
                <div ref={fim} />
              </div>

              <div className="border-t border-border p-3">
                {erro ? (
                  <p role="alert" className="mb-2 text-xs text-destructive">
                    {erro}
                  </p>
                ) : null}
                {imagem ? (
                  <div className="mb-2 flex items-center gap-2 text-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element -- prévia local */}
                    <img src={imagem.url} alt="" className="h-10 rounded" />
                    <button
                      type="button"
                      onClick={() => setImagem(null)}
                      aria-label={t("Remover imagem")}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X size={14} aria-hidden />
                    </button>
                  </div>
                ) : null}
                <div className="flex items-end gap-2">
                  <Textarea
                    value={texto}
                    onChange={(e) => setTexto(e.target.value.slice(0, 2000))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void enviar();
                      }
                    }}
                    placeholder={
                      semMensagens ? t("Mensagens de hoje esgotadas") : t("Escreva sua dúvida…")
                    }
                    disabled={semMensagens}
                    rows={2}
                    className="min-h-0 resize-none"
                    aria-label={t("Sua dúvida")}
                  />
                  <input
                    ref={arquivo}
                    type="file"
                    accept={TIPOS.join(",")}
                    className="hidden"
                    onChange={(e) => {
                      escolherImagem(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => arquivo.current?.click()}
                    disabled={semMensagens}
                    aria-label={t("Anexar print")}
                  >
                    <ImageSquare size={18} aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    onClick={() => void enviar()}
                    disabled={!texto.trim() || enviando || semMensagens}
                    aria-label={t("Enviar")}
                  >
                    <PaperPlaneTilt size={18} aria-hidden />
                  </Button>
                </div>
                {temContato && !ultimoEscalou && !semMensagens ? (
                  <div className="mt-3">
                    <p className="mb-1 text-xs text-muted-foreground">
                      {t("Prefere falar com uma pessoa?")}
                    </p>
                    {contatos}
                  </div>
                ) : null}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
