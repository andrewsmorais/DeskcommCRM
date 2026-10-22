import type { Regua } from "./contraste";

// ARQUIVO GERADO AUTOMATICAMENTE a partir de app/globals.css.
export const REGUA_DO_PRODUTO: Regua = {
  rampaDoProduto: [
    "#f5f3ff",
    "#eef2ff",
    "#ddd6fe",
    "#c4b5fd",
    "#a78bfa",
    "#8b5cf6",
    "#6354df",
    "#5141bd",
    "#433291",
    "#34266d",
    "#1e1542",
  ],
  claro: {
    nome: "claro",
    base: [
      {
        chave: "--color-bg",
        hex: "#f8fafc",
      },
      {
        chave: "--color-surface",
        hex: "#ffffff",
      },
      {
        chave: "--color-surface-elevated",
        hex: "#f1f5f9",
      },
    ],
    tingidas: [
      {
        chave: "--color-accent-soft",
        fonte: {
          tipo: "grau",
          indice: 1,
          alfa: 1,
        },
      },
    ],
    papeis: [
      {
        token: "--color-accent",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 6,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "--color-accent-fg",
        tipo: "texto",
        fonte: {
          tipo: "frenteCalculada",
          sobre: {
            tipo: "grau",
            indice: 6,
            alfa: 1,
          },
        },
        contra: [
          {
            tipo: "grau",
            indice: 6,
            alfa: 1,
          },
        ],
      },
      {
        token: "--color-accent-hover",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 7,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "--ring",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 5,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "::selection/color",
        tipo: "texto",
        fonte: {
          tipo: "grau",
          indice: 10,
          alfa: 1,
        },
        contra: [
          {
            tipo: "grau",
            indice: 2,
            alfa: 1,
          },
        ],
      },
      {
        token: ":focus-visible/outline",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 5,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "@utility bg-cta/background-image",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 6,
          alfa: 1,
        },
        contra: null,
      },
    ],
    semanticas: [
      {
        nome: "success",
        hex: "#059669",
      },
      {
        nome: "warning",
        hex: "#b45309",
      },
      {
        nome: "error",
        hex: "#dc2626",
      },
      {
        nome: "info",
        hex: "#2563eb",
      },
    ],
    neutros: [
      "#f8fafc",
      "#f1f5f9",
      "#e2e8f0",
      "#cbd5e1",
      "#94a3b8",
      "#64748b",
      "#475569",
      "#334155",
      "#1e293b",
      "#0f172a",
      "#020617",
    ],
    indices: {
      accent: 6,
      hover: 7,
      soft: 1,
    },
    alfaDoSoft: 1,
  },
  escuro: {
    nome: "escuro",
    base: [
      {
        chave: "--color-bg",
        hex: "#090a0f",
      },
      {
        chave: "--color-surface",
        hex: "#12131c",
      },
      {
        chave: "--color-surface-elevated",
        hex: "#181a26",
      },
    ],
    tingidas: [
      {
        chave: "--color-accent-soft",
        fonte: {
          tipo: "literal",
          hex: "#7c3aed",
          alfa: 0.15,
        },
      },
    ],
    papeis: [
      {
        token: "--color-accent",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 4,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "--color-accent-fg",
        tipo: "texto",
        fonte: {
          tipo: "frenteCalculada",
          sobre: {
            tipo: "grau",
            indice: 4,
            alfa: 1,
          },
        },
        contra: [
          {
            tipo: "grau",
            indice: 4,
            alfa: 1,
          },
        ],
      },
      {
        token: "--color-accent-hover",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 3,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: "--ring",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 4,
          alfa: 1,
        },
        contra: null,
      },
      {
        token: '[data-theme="dark"] ::selection/color',
        tipo: "texto",
        fonte: {
          tipo: "grau",
          indice: 0,
          alfa: 1,
        },
        contra: [
          {
            tipo: "grau",
            indice: 7,
            alfa: 1,
          },
        ],
      },
      {
        token: '[data-theme="dark"] :focus-visible/outline-color',
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 4,
          alfa: 1,
        },
        contra: null,
      },
    ],
    semanticas: [
      {
        nome: "success",
        hex: "#34d399",
      },
      {
        nome: "warning",
        hex: "#fbbf24",
      },
      {
        nome: "error",
        hex: "#f87171",
      },
      {
        nome: "info",
        hex: "#60a5fa",
      },
    ],
    neutros: [
      "#f8fafc",
      "#e2e8f0",
      "#cbd5e1",
      "#94a3b8",
      "#64748b",
      "#475569",
      "#34374b",
      "#181a26",
      "#12131c",
      "#090a0f",
      "#050609",
    ],
    indices: {
      accent: 4,
      hover: 3,
      soft: null,
    },
    alfaDoSoft: 0.15,
  },
};
