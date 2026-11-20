/**
 * UM HANDLER QUE NÃO VOLTA NÃO PARA A FILA DE TODO MUNDO.
 *
 * O dreno do event_log atende todas as organizações numa fila só e aguarda
 * cada handler. O envio de Web Push não tinha timeout, e o endpoint é escolhido
 * por qualquer membro: um endpoint que manda os cabeçalhos e para deixava o
 * `dispatchEvent` pendente para sempre, e com ele o dreno inteiro.
 *
 * O prazo transforma o handler preso num `error` daquele evento — uma
 * tentativa, que o drain.ts reagenda com backoff — e devolve a fila.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  dispatchEvent,
  HANDLER_DEADLINE_MS,
  registerHandler,
  type EventRow,
} from "@/lib/event-log/dispatcher";
import { webPushInboundHandler } from "@/lib/notifications/push.handler";

const linha = (event_type: string): EventRow => ({
  id: `ev-${event_type}`,
  organization_id: "org-a",
  event_type,
  entity_kind: "conversation",
  entity_id: null,
  payload: {},
  metadata: {},
  consumed_by: [],
  attempts: 0,
});

const nunca = () => new Promise<never>(() => undefined);

/** O desfecho, ou "travou" se o dispatch não voltar em `ms` reais. */
async function emAte<T>(p: Promise<T>, ms: number): Promise<T | "travou"> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<"travou">((r) => (timer = setTimeout(() => r("travou"), ms)));
  try {
    return await Promise.race([p, limite]);
  } finally {
    clearTimeout(timer);
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe("dispatchEvent: prazo por handler", () => {
  it("handler preso vira error daquele evento, e o handler seguinte ainda roda", async () => {
    const seguinte = vi.fn(async () => ({ consumer_key: "prazo.seguinte", status: "ok" as const }));
    registerHandler({
      key: "prazo.preso",
      events: ["teste.prazo_curto"],
      deadlineMs: 20,
      handle: nunca,
    });
    registerHandler({ key: "prazo.seguinte", events: ["teste.prazo_curto"], handle: seguinte });

    const r = await emAte(dispatchEvent(linha("teste.prazo_curto")), 2_000);
    expect(r, "o dispatch ficou pendente: a fila de todas as organizações parou aqui").not.toBe(
      "travou",
    );
    expect(r).toEqual([
      expect.objectContaining({
        consumer_key: "prazo.preso",
        status: "error",
        detail: expect.stringContaining("handler_deadline"),
      }),
      { consumer_key: "prazo.seguinte", status: "ok" },
    ]);
    expect(seguinte).toHaveBeenCalledTimes(1);
  });

  it("sem prazo declarado vale o padrão, abaixo da janela de 10 min do reaper", async () => {
    expect(HANDLER_DEADLINE_MS).toBeGreaterThan(0);
    expect(HANDLER_DEADLINE_MS).toBeLessThan(10 * 60 * 1000);

    vi.useFakeTimers();
    registerHandler({ key: "prazo.padrao", events: ["teste.prazo_padrao"], handle: nunca });
    const p = dispatchEvent(linha("teste.prazo_padrao"));
    await vi.advanceTimersByTimeAsync(HANDLER_DEADLINE_MS + 1);
    const r = await emAte(p, 0);
    expect(r).toEqual([expect.objectContaining({ consumer_key: "prazo.padrao", status: "error" })]);
  });

  it("o Web Push declara prazo curto — o destino dele é escolhido por qualquer membro", () => {
    expect(webPushInboundHandler.deadlineMs).toBeGreaterThan(0);
    expect(webPushInboundHandler.deadlineMs!).toBeLessThanOrEqual(60_000);
  });
});
