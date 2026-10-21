/** Ambiente DOM compartilhado; não carrega credenciais nem arquivos .env. */
import "@testing-library/jest-dom/vitest";

// Node 25+ expõe `localStorage`/`sessionStorage` nativos que não servem sem
// `--localstorage-file` (no 26.8 valem `undefined`; no 25.4 são um objeto sem `.clear`),
// e o jsdom não os sobrescreve: `localStorage.clear()` quebrava ~100 testes. A guarda
// testa a capacidade, não o tipo, para cobrir os dois. Quando o global nativo não serve,
// devolve o storage do jsdom do arquivo. Em Node 22 o global já é o do jsdom e este
// bloco não faz nada.
const jsdomDoArquivo = (globalThis as { jsdom?: { window: Window } }).jsdom;
if (jsdomDoArquivo) {
  for (const nome of ["localStorage", "sessionStorage"] as const) {
    if (typeof globalThis[nome]?.clear !== "function") {
      Object.defineProperty(globalThis, nome, {
        configurable: true,
        get: () => jsdomDoArquivo.window[nome],
      });
    }
  }
}

// jsdom não implementa ResizeObserver; Radix (ex.: Switch) usa em layout effects.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

/**
 * O timer que o Radix deixa para trás não pode disparar em outro jsdom.
 *
 * Ao desmontar, o `FocusScope` do Radix (Dialog, Popover, Sheet…) agenda um
 * `setTimeout(0)` que faz `new CustomEvent(...)` e `container.dispatchEvent`.
 * Quando o componente é desmontado pela limpeza do ÚLTIMO teste de um arquivo,
 * esse timer pode disparar depois que o ambiente jsdom do arquivo já foi
 * desfeito: o evento nasce de outro `window` e o jsdom recusa com
 * "Failed to execute 'dispatchEvent' on 'EventTarget': parameter 1 is not of
 * type 'Event'". O vitest conta isso como erro não tratado e reprova a suíte
 * com todos os arquivos verdes — medido no `verify` do #1163 (run
 * 35336406831), atribuído a `composer-colar-imagem.test.tsx`, e intermitente
 * porque depende do relógio do runner.
 *
 * O conserto é dar ao timer a vez de rodar ENQUANTO o jsdom do arquivo existe:
 * desmonta explicitamente e espera um tique de macrotarefa. Com relógio falso
 * ligado não há o que esperar (o timer também é falso) — e esperar um
 * `setTimeout` falso travaria o hook até o teto do teste.
 */
if (typeof document !== "undefined") {
  const { afterEach, vi } = await import("vitest");
  const { cleanup } = await import("@testing-library/react");
  afterEach(async () => {
    cleanup();
    if (vi.isFakeTimers()) return;
    await new Promise((resolver) => setTimeout(resolver, 0));
  });
}
