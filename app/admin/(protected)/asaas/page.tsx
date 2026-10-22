import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  ambienteDoAsaas,
  lerAssinaturas,
  lerCobrancas,
  lerSaldo,
  lerWebhooks,
  MOTIVO_LEGIVEL,
  type LeituraAsaas,
} from "@/lib/admin/asaas-leitura";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";

export const metadata = { title: "Asaas — Admin Plataforma" };
export const dynamic = "force-dynamic";

const reais = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const data = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

function Aviso({ children, tom = "aviso" }: { children: ReactNode; tom?: "aviso" | "erro" }) {
  return (
    <p
      role="alert"
      className={
        tom === "erro"
          ? "rounded-md border border-destructive/40 p-3 text-sm text-destructive"
          : "rounded-md border border-warning/40 bg-warning-bg p-3 text-sm text-warning-fg"
      }
    >
      {children}
    </p>
  );
}

function motivo<T>(r: LeituraAsaas<T>): string {
  return r.ok ? "" : (MOTIVO_LEGIVEL[r.motivo] ?? "Não consegui ler este dado agora.");
}

const BILLING: Record<string, string> = { BOLETO: "Boleto", CREDIT_CARD: "Cartão", PIX: "Pix", UNDEFINED: "A definir" };
const CICLO: Record<string, string> = { MONTHLY: "Mensal", QUARTERLY: "Trimestral", YEARLY: "Anual", WEEKLY: "Semanal", BIWEEKLY: "Quinzenal", SEMIANNUALLY: "Semestral" };

const GRUPOS_DE_COBRANCA = [
  { status: "PENDING", titulo: "Pendentes", ajuda: "Aguardando pagamento." },
  { status: "OVERDUE", titulo: "Vencidas", ajuda: "Passaram do vencimento sem pagar." },
  { status: "RECEIVED", titulo: "Recebidas", ajuda: "Já pagas e liquidadas." },
  { status: "REFUNDED", titulo: "Estornadas", ajuda: "Devolvidas ao cliente." },
] as const;

export default async function AsaasPage() {
  await requirePlatformAdmin();

  const amb = ambienteDoAsaas();
  if (!amb.configurado) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Asaas — pagamentos</h1>
        <Aviso>{MOTIVO_LEGIVEL.sem_chave_do_asaas} Configure a chave no arquivo de ambiente do servidor e reinicie.</Aviso>
      </div>
    );
  }

  const [saldo, webhooks, ativas, canceladas, ...cobrancas] = await Promise.all([
    lerSaldo(),
    lerWebhooks(),
    lerAssinaturas("ACTIVE"),
    lerAssinaturas("INACTIVE"),
    ...GRUPOS_DE_COBRANCA.map((g) => lerCobrancas(g.status)),
  ]);

  const webhooksPausados = webhooks.ok ? webhooks.dados.filter((w) => w.interrompido === true) : [];
  const semWebhookAtivo = webhooks.ok && !webhooks.dados.some((w) => w.ativo === true);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Asaas — pagamentos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Saldo, assinaturas, cobranças, cancelamentos e webhooks da sua conta no Asaas. Somente leitura.
          </p>
        </div>
        <Badge variant={amb.sandbox ? "secondary" : "default"}>{amb.sandbox ? "Sandbox (teste)" : "Produção"}</Badge>
      </div>

      {amb.sandbox ? (
        <Aviso>
          Você está vendo a conta de TESTE do Asaas. Nenhum dinheiro real aparece aqui. Para ver a conta real, troque a
          chave e o endereço no servidor.
        </Aviso>
      ) : null}

      {webhooksPausados.length > 0 ? (
        <Aviso tom="erro">
          {webhooksPausados.length === 1 ? "Um webhook está pausado" : `${webhooksPausados.length} webhooks estão pausados`}{" "}
          pelo Asaas por falhas seguidas de entrega. Enquanto isso, pagamentos e cancelamentos não chegam ao CRM. Corrija o
          endereço e reative no painel do Asaas.
        </Aviso>
      ) : null}
      {semWebhookAtivo ? (
        <Aviso tom="erro">Nenhum webhook ativo no Asaas. Pagamentos confirmados não atualizam as assinaturas sozinhos.</Aviso>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="space-y-1 pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Saldo na conta</p>
            {saldo.ok ? (
              <p className="text-2xl font-semibold tabular-nums">{reais(saldo.dados.saldo)}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{motivo(saldo)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Assinaturas ativas</p>
            {ativas.ok ? (
              <p className="text-2xl font-semibold tabular-nums">{ativas.dados.total ?? ativas.dados.itens.length}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{motivo(ativas)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-1 pt-6">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Assinaturas canceladas</p>
            {canceladas.ok ? (
              <p className="text-2xl font-semibold tabular-nums">{canceladas.dados.total ?? canceladas.dados.itens.length}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{motivo(canceladas)}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Webhooks configurados</CardTitle>
          <CardDescription>
            Os endereços para onde o Asaas avisa cada pagamento. O token de segurança nunca é exibido.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!webhooks.ok ? (
            <p className="text-sm text-muted-foreground">{motivo(webhooks)}</p>
          ) : webhooks.dados.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nenhum webhook configurado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Destino</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Eventos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.dados.map((w, i) => (
                  <TableRow key={`${w.destino}-${i}`}>
                    <TableCell>{w.nome ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate font-mono text-xs" title={w.destino ?? undefined}>
                      {w.destino ?? "—"}
                    </TableCell>
                    <TableCell className="space-x-1">
                      {w.ativo === null ? (
                        <Badge variant="secondary">—</Badge>
                      ) : (
                        <Badge variant={w.ativo ? "default" : "secondary"}>{w.ativo ? "Ativo" : "Desligado"}</Badge>
                      )}
                      {w.interrompido ? <Badge variant="destructive">Pausado</Badge> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{w.eventos ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assinaturas canceladas</CardTitle>
            <CardDescription>As 20 mais recentes que o Asaas devolve.</CardDescription>
          </CardHeader>
          <CardContent>
            {!canceladas.ok ? (
              <p className="text-sm text-muted-foreground">{motivo(canceladas)}</p>
            ) : canceladas.dados.itens.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma assinatura cancelada.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Ciclo</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {canceladas.dados.itens.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.id}</TableCell>
                      <TableCell>{CICLO[s.ciclo ?? ""] ?? s.ciclo ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{reais(s.valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assinaturas ativas</CardTitle>
            <CardDescription>As 20 primeiras que o Asaas devolve.</CardDescription>
          </CardHeader>
          <CardContent>
            {!ativas.ok ? (
              <p className="text-sm text-muted-foreground">{motivo(ativas)}</p>
            ) : ativas.dados.itens.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma assinatura ativa.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Ciclo</TableHead>
                    <TableHead>Próx. venc.</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ativas.dados.itens.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.id}</TableCell>
                      <TableCell>{CICLO[s.ciclo ?? ""] ?? s.ciclo ?? "—"}</TableCell>
                      <TableCell>{data(s.proximoVencimento)}</TableCell>
                      <TableCell className="text-right tabular-nums">{reais(s.valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {GRUPOS_DE_COBRANCA.map((g, i) => {
          const r = cobrancas[i];
          return (
            <Card key={g.status}>
              <CardHeader>
                <CardTitle className="text-base">
                  Cobranças {g.titulo.toLowerCase()}
                  {r?.ok && r.dados.total !== null ? (
                    <span className="ml-2 text-sm font-normal text-muted-foreground">({r.dados.total})</span>
                  ) : null}
                </CardTitle>
                <CardDescription>{g.ajuda}</CardDescription>
              </CardHeader>
              <CardContent>
                {!r || !r.ok ? (
                  <p className="text-sm text-muted-foreground">{r ? motivo(r) : "—"}</p>
                ) : r.dados.itens.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma cobrança.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Forma</TableHead>
                        <TableHead>Venc.</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {r.dados.itens.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-xs">{p.id}</TableCell>
                          <TableCell>{BILLING[p.forma ?? ""] ?? p.forma ?? "—"}</TableCell>
                          <TableCell>{data(p.vencimento)}</TableCell>
                          <TableCell className="text-right tabular-nums">{reais(p.valor)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
