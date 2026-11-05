/**
 * O dreno da `storage_redaction_queue` só apaga objeto da organização da linha,
 * nos buckets que a fila alimenta.
 *
 * Achado da auditoria de 04/11/2026: a fila era gravável por qualquer membro
 * pela REST, e o dreno apagava `row.bucket`/`row.object_path` com a service
 * role, sem conferir nada. Um leitor plantou `brand-logos/platform/<id>.png`
 * (o logo da tela de login de todas as organizações) e a mídia de outra
 * organização, e o dreno real apagou os dois. A migration 0501 fecha a escrita;
 * esta guarda vale para linha que já estava lá e para produtor que errar.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const ORG_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ORG_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const estado = vi.hoisted(() => ({
  linhas: [] as {
    id: string;
    organization_id: string;
    bucket: string;
    object_path: string;
    attempts: number;
  }[],
  removidos: [] as { bucket: string; paths: string[] }[],
  atualizacoes: [] as { id: string; patch: Record<string, unknown> }[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      let patch: Record<string, unknown> = {};
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.order = () => q;
      q.limit = async () => ({ data: estado.linhas, error: null });
      q.update = (p: Record<string, unknown>) => {
        patch = p;
        return q;
      };
      q.eq = (col: string, valor: string) => {
        if (col === "id") {
          estado.atualizacoes.push({ id: valor, patch });
          return Promise.resolve({ error: null });
        }
        return q;
      };
      return q;
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          estado.removidos.push({ bucket, paths });
          return { error: null };
        },
      }),
    },
  }),
}));

import { alvoDaFilaValido, drainStorageRedactionQueue } from "@/lib/lgpd/storage-redaction-queue";

beforeEach(() => {
  estado.linhas = [];
  estado.removidos = [];
  estado.atualizacoes = [];
});

describe("dreno da fila de exclusão de mídia", () => {
  it("não apaga o logo da instalação nem a mídia de outra organização", async () => {
    estado.linhas = [
      {
        id: "1",
        organization_id: ORG_A,
        bucket: "brand-logos",
        object_path: "platform/x.png",
        attempts: 0,
      },
      {
        id: "2",
        organization_id: ORG_A,
        bucket: "whatsapp-media",
        object_path: `${ORG_B}/c/foto.jpg`,
        attempts: 0,
      },
      {
        id: "3",
        organization_id: ORG_A,
        bucket: "whatsapp-media",
        object_path: `${ORG_A}/../${ORG_B}/f.jpg`,
        attempts: 0,
      },
    ];
    const stats = await drainStorageRedactionQueue();
    expect(estado.removidos).toEqual([]);
    expect(stats.failed).toBe(3);
    expect(
      estado.atualizacoes.every((a) => a.patch.error_message === "target_outside_tenant"),
    ).toBe(true);
  });

  it("controle: apaga a mídia e a proposta da própria organização", async () => {
    estado.linhas = [
      {
        id: "4",
        organization_id: ORG_A,
        bucket: "whatsapp-media",
        object_path: `${ORG_A}/c/m.jpg`,
        attempts: 0,
      },
      {
        id: "5",
        organization_id: ORG_A,
        bucket: "propostas",
        object_path: `${ORG_A}/p.pdf`,
        attempts: 0,
      },
    ];
    const stats = await drainStorageRedactionQueue();
    expect(stats.deleted).toBe(2);
    expect(estado.removidos).toEqual([
      { bucket: "whatsapp-media", paths: [`${ORG_A}/c/m.jpg`] },
      { bucket: "propostas", paths: [`${ORG_A}/p.pdf`] },
    ]);
  });

  it("a regra pura recusa prefixo parecido (org que começa com o mesmo texto)", () => {
    expect(
      alvoDaFilaValido({
        organization_id: ORG_A,
        bucket: "whatsapp-media",
        object_path: `${ORG_A}x/m.jpg`,
      }),
    ).toBe(false);
  });
});
