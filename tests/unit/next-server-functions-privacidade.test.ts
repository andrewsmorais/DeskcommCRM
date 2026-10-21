// @vitest-environment node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

import { defaultConfig, type LoggingConfig } from "next/dist/server/config-shared";
import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";

const requireDoTeste = createRequire(import.meta.url);
const fonteDoHandler = readFileSync(
  requireDoTeste.resolve("next/dist/server/app-render/action-handler"),
  "utf8",
);
const inicio = fonteDoHandler.indexOf("// Log server action call in development when enabled");
const fim = fonteDoHandler.indexOf("const startTime = performance.now();", inicio);
const credenciaisFicticias = {
  email: "sentinela@example.invalid",
  password: "SENTINELA_FICTICIA_NUNCA_USADA_COMO_SENHA",
};

/** Executa somente a guarda de logging do Next instalado, sem chamar a ação. */
function metadadosDaInvocacao(logging: LoggingConfig | false | undefined) {
  expect(inicio).toBeGreaterThanOrEqual(0);
  expect(fim).toBeGreaterThan(inicio);
  const resolvido = logging ?? defaultConfig.logging;
  const contexto = {
    process: { env: { NODE_ENV: "development", NEXT_RUNTIME: "node" } },
    ctx: {
      renderOpts: {
        dir: "/projeto-ficticio",
        logServerFunctions: typeof resolvido === "object" && Boolean(resolvido.serverFunctions),
      },
    },
    actionId: "acao-ficticia",
    boundActionArguments: [credenciaisFicticias],
    INLINE_ACTION_PREFIX: "$$ACTION_",
    _serverreferenceinfo: { extractInfoFromServerReferenceId: () => ({ type: "server-action" }) },
    _manifestssingleton: {
      getServerActionsManifest: () => ({
        node: {
          "acao-ficticia": {
            exportedName: "signInWithPassword",
            filename: "/projeto-ficticio/app/actions/auth/signInWithPassword.ts",
          },
        },
      }),
    },
    _segmentexplorerpath: { normalizeFilePath: () => "app/actions/auth/signInWithPassword.ts" },
  };
  return runInNewContext(fonteDoHandler.slice(inicio, fim) + "\nlogInfo", contexto) as {
    args: unknown[];
  } | null;
}

describe("privacidade dos argumentos de Server Functions", () => {
  it("desliga explicitamente a captura na configuração final exportada com Sentry", () => {
    expect(nextConfig.logging).toMatchObject({ serverFunctions: false });
    expect(metadadosDaInvocacao(nextConfig.logging)).toBeNull();
  });

  it("detecta a captura das sentinelas se o logging do framework for reativado", () => {
    expect(metadadosDaInvocacao({ serverFunctions: true })?.args).toEqual([credenciaisFicticias]);
  });
});
