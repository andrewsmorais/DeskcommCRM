import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createPool: vi.fn() }));
vi.mock("./pool", () => ({ createPool: mocks.createPool }));

beforeEach(() => {
  vi.resetModules();
  mocks.createPool.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("pool do motor de IA", () => {
  it.each([undefined, ""])("conexão ausente (%s) usa erro tipado sem abrir pool", async (url) => {
    vi.stubEnv("SUPABASE_DB_URL", url);
    const { getRequestPool, RequestPoolNotConfiguredError } = await import("./request-pool");
    expect(() => getRequestPool()).toThrow(RequestPoolNotConfiguredError);
    expect(() => getRequestPool()).toThrow(
      expect.objectContaining({ name: "RequestPoolNotConfiguredError" }),
    );
    expect(mocks.createPool).not.toHaveBeenCalled();
  });

  it("configuração válida mantém um único pool sob demanda", async () => {
    const url = "postgresql://fixture:senha-ficticia@127.0.0.1:5432/fixture";
    const pool = { query: vi.fn() };
    vi.stubEnv("SUPABASE_DB_URL", url);
    mocks.createPool.mockReturnValue(pool);
    const { getRequestPool } = await import("./request-pool");
    expect(mocks.createPool).not.toHaveBeenCalled();
    expect(getRequestPool()).toBe(pool);
    expect(getRequestPool()).toBe(pool);
    expect(mocks.createPool).toHaveBeenCalledExactlyOnceWith(url);
  });
});
