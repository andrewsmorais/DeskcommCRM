import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { comReservaDeCota, ErroDaReservaDeCota } from "./reserva";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn() } }));

const ORG = "10000000-0000-4000-8000-000000000001";
const OUTRA_ORG = "20000000-0000-4000-8000-000000000002";
const ENDPOINT = "billing:quota-reservation";
const AGORA = new Date("2026-10-16T12:00:00.000Z");

type Linha = {
  id: string;
  organization_id: string;
  key: string;
  endpoint: string;
  request_hash: string;
  expires_at: string;
  status_code: number | null;
  response_body: unknown;
};
type Filtro = { coluna: keyof Linha; operador: "eq" | "lte"; valor: unknown };
type Escrita = { tipo: "insert" | "update" | "delete"; valores: Partial<Linha>; filtros: Filtro[] };
type Falha = { code: string; message: string };

/** Banco em memória que disputa a chave única e atualiza somente os filtros que casam. */
function criarBanco(iniciais: Linha[] = []) {
  const linhas = iniciais.map((linha) => ({ ...linha }));
  const escritas: Escrita[] = [];
  const falhas: { insert?: Falha | Error; update?: Falha | Error; delete?: Falha | Error } = {};
  let proximoId = 0;

  const executar = (escrita: Escrita) => {
    escritas.push(escrita);
    const falha = falhas[escrita.tipo];
    if (falha instanceof Error) return Promise.reject(falha);
    if (falha) return Promise.resolve({ data: null, error: falha });
    if (escrita.tipo === "insert") {
      const valor = escrita.valores;
      if (
        linhas.some(
          (linha) =>
            linha.organization_id === valor.organization_id &&
            linha.key === valor.key &&
            linha.endpoint === valor.endpoint,
        )
      ) {
        return Promise.resolve({
          data: null,
          error: { code: "23505", message: "chave duplicada" },
        });
      }
      linhas.push({ ...valor, id: `reserva-${++proximoId}` } as Linha);
      return Promise.resolve({ data: null, error: null });
    }
    const casam = (linha: Linha) =>
      escrita.filtros.every(({ coluna, operador, valor }) =>
        operador === "eq" ? linha[coluna] === valor : String(linha[coluna]) <= String(valor),
      );
    const alteradas: { id: string }[] = [];
    for (let i = linhas.length - 1; i >= 0; i--) {
      const linha = linhas[i];
      if (!linha || !casam(linha)) continue;
      alteradas.push({ id: linha.id });
      if (escrita.tipo === "update") Object.assign(linha, escrita.valores);
      else linhas.splice(i, 1);
    }
    return Promise.resolve({ data: alteradas, error: null });
  };

  const consulta = (tipo: "update" | "delete", valores: Partial<Linha> = {}) => {
    const escrita: Escrita = { tipo, valores, filtros: [] };
    const q = {
      eq(coluna: keyof Linha, valor: unknown) {
        escrita.filtros.push({ coluna, operador: "eq", valor });
        return q;
      },
      lte(coluna: keyof Linha, valor: unknown) {
        escrita.filtros.push({ coluna, operador: "lte", valor });
        return q;
      },
      select() {
        return executar(escrita);
      },
      then(
        resolve: (resultado: Awaited<ReturnType<typeof executar>>) => unknown,
        reject: (erro: unknown) => unknown,
      ) {
        return executar(escrita).then(resolve, reject);
      },
    };
    return q;
  };
  const db = {
    from(tabela: string) {
      expect(tabela).toBe("idempotency_keys");
      return {
        insert(valores: Partial<Linha>) {
          return executar({ tipo: "insert", valores, filtros: [] });
        },
        update(valores: Partial<Linha>) {
          return consulta("update", valores);
        },
        delete() {
          return consulta("delete");
        },
      };
    },
  };
  vi.mocked(createAdminClient).mockReturnValue(db as never);
  return { linhas, escritas, falhas };
}

function linha(patch: Partial<Linha> = {}): Linha {
  return {
    id: "reserva-antiga",
    organization_id: ORG,
    key: "billing:atendentes",
    endpoint: ENDPOINT,
    request_hash: "\\xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    expires_at: "2026-10-16T11:59:00.000Z",
    status_code: null,
    response_body: null,
    ...patch,
  };
}

function sinal() {
  let resolver!: () => void;
  const promessa = new Promise<void>((resolve) => {
    resolver = resolve;
  });
  return { promessa, resolver };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("reserva distribuída de cota", () => {
  it("grava hash bytea e lease de dez minutos antes do efeito; libera somente o próprio lease", async () => {
    const banco = criarBanco();
    const efeito = vi.fn(async () => {
      expect(banco.linhas).toHaveLength(1);
      const propria = banco.linhas[0];
      expect(propria).toMatchObject({
        organization_id: ORG,
        key: "billing:whatsapp",
        endpoint: ENDPOINT,
        status_code: null,
        response_body: null,
      });
      expect(propria?.request_hash).toMatch(/^\\x[0-9a-f]{64}$/);
      expect(propria?.expires_at).toBe("2026-10-16T12:10:00.000Z");
      expect(banco.escritas).toHaveLength(1);
      return "conectado";
    });

    expect(await comReservaDeCota(ORG, "whatsapp", efeito)).toBe("conectado");
    expect(efeito).toHaveBeenCalledOnce();
    expect(banco.linhas).toEqual([]);
    const inserida = banco.escritas[0]?.valores;
    expect(banco.escritas[1]).toEqual({
      tipo: "delete",
      valores: {},
      filtros: [
        { coluna: "organization_id", operador: "eq", valor: ORG },
        { coluna: "key", operador: "eq", valor: "billing:whatsapp" },
        { coluna: "endpoint", operador: "eq", valor: ENDPOINT },
        { coluna: "request_hash", operador: "eq", valor: inserida?.request_hash },
      ],
    });
  });

  it("duas chamadas concorrentes da mesma cota deixam só uma executar", async () => {
    const banco = criarBanco();
    const iniciou = sinal();
    const terminar = sinal();
    const primeiroEfeito = vi.fn(async () => {
      iniciou.resolver();
      await terminar.promessa;
      return "primeiro";
    });
    const segundoEfeito = vi.fn(async () => "segundo");
    const primeira = comReservaDeCota(ORG, "atendentes", primeiroEfeito);
    await iniciou.promessa;

    await expect(comReservaDeCota(ORG, "atendentes", segundoEfeito)).rejects.toMatchObject({
      status: 409,
    });
    expect(primeiroEfeito).toHaveBeenCalledOnce();
    expect(segundoEfeito).not.toHaveBeenCalled();
    expect(banco.linhas).toHaveLength(1);
    terminar.resolver();
    expect(await primeira).toBe("primeiro");
    expect(banco.linhas).toEqual([]);
  });

  it("reserva vencida é retomada por CAS; dois concorrentes não tomam a mesma linha", async () => {
    const banco = criarBanco([linha()]);
    const iniciou = sinal();
    const terminar = sinal();
    const vencedor = vi.fn(async () => {
      iniciou.resolver();
      await terminar.promessa;
      return "retomado";
    });
    const perdedor = vi.fn(async () => "indevido");
    const primeira = comReservaDeCota(ORG, "atendentes", vencedor);
    const segunda = comReservaDeCota(ORG, "atendentes", perdedor).catch((erro: unknown) => erro);
    await iniciou.promessa;

    expect(await segunda).toMatchObject({ status: 409 });
    expect(perdedor).not.toHaveBeenCalled();
    const retomadas = banco.escritas.filter((escrita) => escrita.tipo === "update");
    expect(retomadas).toHaveLength(2);
    expect(
      retomadas.every((escrita) =>
        escrita.filtros.some(
          (filtro) =>
            filtro.coluna === "expires_at" &&
            filtro.operador === "lte" &&
            filtro.valor === AGORA.toISOString(),
        ),
      ),
    ).toBe(true);
    expect(banco.linhas[0]?.expires_at).toBe("2026-10-16T12:10:00.000Z");
    expect(banco.linhas[0]?.request_hash).not.toBe(linha().request_hash);
    terminar.resolver();
    expect(await primeira).toBe("retomado");
    expect(banco.linhas).toEqual([]);
  });

  it("dono atrasado não apaga a reserva de quem a retomou após o vencimento", async () => {
    const banco = criarBanco();
    const iniciouPrimeiro = sinal();
    const iniciouSegundo = sinal();
    const terminarPrimeiro = sinal();
    const terminarSegundo = sinal();
    const primeira = comReservaDeCota(ORG, "pipelines", async () => {
      iniciouPrimeiro.resolver();
      await terminarPrimeiro.promessa;
      return "antigo";
    });
    await iniciouPrimeiro.promessa;
    const hashAntigo = banco.linhas[0]?.request_hash;
    vi.setSystemTime(new Date(AGORA.getTime() + 11 * 60 * 1000));
    const segunda = comReservaDeCota(ORG, "pipelines", async () => {
      iniciouSegundo.resolver();
      await terminarSegundo.promessa;
      return "novo";
    });
    await iniciouSegundo.promessa;
    const hashNovo = banco.linhas[0]?.request_hash;
    expect(hashNovo).not.toBe(hashAntigo);

    terminarPrimeiro.resolver();
    expect(await primeira).toBe("antigo");
    expect(banco.linhas).toHaveLength(1);
    expect(banco.linhas[0]?.request_hash).toBe(hashNovo);
    terminarSegundo.resolver();
    expect(await segunda).toBe("novo");
    expect(banco.linhas).toEqual([]);
  });

  it("não bloqueia outra organização ou cota nem toca recibos HTTP de outras operações", async () => {
    const recibos = [
      linha({
        id: "outra-org",
        organization_id: OUTRA_ORG,
        expires_at: "2026-10-16T13:00:00.000Z",
      }),
      linha({ id: "outra-cota", key: "billing:whatsapp", expires_at: "2026-10-16T13:00:00.000Z" }),
      linha({
        id: "recibo-http",
        endpoint: "/api/v1/pipelines",
        status_code: 201,
        response_body: { data: { id: "pipeline" } },
        expires_at: "2026-10-17T12:00:00.000Z",
      }),
    ];
    const banco = criarBanco(recibos);

    expect(await comReservaDeCota(ORG, "atendentes", async () => "criado")).toBe("criado");
    expect(banco.linhas).toEqual(recibos);
  });

  it.each([{ code: "42501", message: "acesso negado" }, new Error("rede privada indisponível")])(
    "falha de INSERT responde 503 antes do efeito",
    async (falha) => {
      const banco = criarBanco();
      banco.falhas.insert = falha;
      const efeito = vi.fn(async () => "indevido");

      await expect(comReservaDeCota(ORG, "atendentes", efeito)).rejects.toMatchObject({
        name: "ErroDaReservaDeCota",
        status: 503,
      });
      expect(efeito).not.toHaveBeenCalled();
      expect(banco.escritas).toHaveLength(1);
    },
  );

  it("falha ao criar o cliente responde 503 antes do efeito", async () => {
    vi.mocked(createAdminClient).mockImplementationOnce(() => {
      throw new Error("configuração privada");
    });
    const efeito = vi.fn(async () => "indevido");

    await expect(comReservaDeCota(ORG, "atendentes", efeito)).rejects.toBeInstanceOf(
      ErroDaReservaDeCota,
    );
    expect(efeito).not.toHaveBeenCalled();
  });

  it("erro na retomada de reserva vencida responde 503 e não executa", async () => {
    const banco = criarBanco([linha()]);
    banco.falhas.update = { code: "08006", message: "conexão interrompida" };
    const efeito = vi.fn(async () => "indevido");

    await expect(comReservaDeCota(ORG, "atendentes", efeito)).rejects.toMatchObject({
      status: 503,
    });
    expect(efeito).not.toHaveBeenCalled();
    expect(banco.linhas).toEqual([linha()]);
    expect(banco.escritas.some((escrita) => escrita.tipo === "delete")).toBe(false);
  });

  it("erro de domínio é preservado e a reserva é liberada", async () => {
    const banco = criarBanco();
    const erro = new Error("O plano não possui vaga disponível.");

    await expect(
      comReservaDeCota(ORG, "atendentes", async () => {
        throw erro;
      }),
    ).rejects.toBe(erro);
    expect(banco.linhas).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("falha de liberação preserva o sucesso e avisa sem identificar cliente ou hash", async () => {
    const banco = criarBanco();
    banco.falhas.delete = { code: "08006", message: "detalhe privado do banco" };

    expect(await comReservaDeCota(ORG, "whatsapp", async () => "conectado")).toBe("conectado");
    expect(banco.linhas).toHaveLength(1);
    expect(banco.linhas[0]?.expires_at).toBe("2026-10-16T12:10:00.000Z");
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
      "[billing] não foi possível liberar a reserva de cota; ela vencerá pelo prazo",
    );
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain(ORG);
    expect(JSON.stringify(vi.mocked(logger.warn).mock.calls)).not.toContain("detalhe privado");
  });

  it("rejeição na liberação não substitui o erro original da operação", async () => {
    const banco = criarBanco();
    banco.falhas.delete = new Error("falha privada na limpeza");
    const erro = new Error("sem capacidade");

    await expect(
      comReservaDeCota(ORG, "atendentes", async () => {
        throw erro;
      }),
    ).rejects.toBe(erro);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(banco.linhas).toHaveLength(1);
  });
});
