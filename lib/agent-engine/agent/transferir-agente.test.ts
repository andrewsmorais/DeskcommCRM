/**
 * Passar a conversa para outro agente de IA (vindo do produto original,
 * adaptado): a escolha vai para `active_intent = 'transferido'` junto com a
 * trilha, e cada recusa não escreve nada.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const campanha = vi.hoisted(() => vi.fn());
const carregar = vi.hoisted(() => vi.fn());
vi.mock('./agente-da-campanha', () => ({ agenteDaCampanhaDaConversa: campanha }));
vi.mock('./agent-config', () => ({ loadPublishedAgentConfigById: carregar }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import {
  ferramentaDePassagemEntreAgentes,
  INTENCAO_DA_PASSAGEM,
  TransferenciaDeAgenteRecusada,
  transferirAgenteDaConversa,
} from './transferir-agente';

function poolFalso(conversa: { active_ai_agent_id: string | null } | null, destinos: unknown[] = []) {
  const consultas: Array<{ sql: string; params: unknown[] }> = [];
  const pool = {
    query: vi.fn(async (sql: string, params: unknown[]) => {
      consultas.push({ sql, params });
      if (sql.includes('from conversations where')) return { rows: conversa ? [conversa] : [] };
      if (sql.includes('from ai_agents a')) return { rows: destinos };
      if (sql.includes('insert into ai_router_decisions')) return { rowCount: 1, rows: [] };
      return { rows: [] };
    }),
  };
  return { pool: pool as never, consultas };
}

const ENTRADA = {
  organizationId: 'org-a',
  conversationId: 'conv-1',
  agenteDestinoId: 'agente-b',
  motivo: 'pedido_do_agente' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  campanha.mockResolvedValue(null);
  carregar.mockResolvedValue({ agentId: 'agente-b', pausedAt: null });
});

describe('transferirAgenteDaConversa', () => {
  it('grava a escolha e a trilha numa escrita só', async () => {
    const f = poolFalso({ active_ai_agent_id: 'agente-a' });
    const r = await transferirAgenteDaConversa(f.pool, ENTRADA);
    expect(r).toEqual({ agenteAnteriorId: 'agente-a', agenteDestinoId: 'agente-b' });
    const escrita = f.consultas.find((c) => c.sql.includes('insert into ai_router_decisions'));
    expect(escrita?.sql).toContain('update conversations');
    expect(escrita?.params).toEqual(['org-a', 'conv-1', 'agente-b', INTENCAO_DA_PASSAGEM, null, 'agente-a', 'pedido_do_agente', null]);
  });

  it.each([
    ['conversa de outra organização', () => poolFalso(null), 'conversa_nao_encontrada'],
    ['já está com o agente', () => poolFalso({ active_ai_agent_id: 'agente-b' }), 'ja_esta_no_agente'],
  ])('%s: recusa sem escrever', async (_nome, montar, codigo) => {
    const f = montar();
    await expect(transferirAgenteDaConversa(f.pool, ENTRADA)).rejects.toMatchObject({ codigo });
    expect(f.consultas.some((c) => c.sql.includes('insert'))).toBe(false);
  });

  it('conversa de campanha com agente próprio: recusa', async () => {
    campanha.mockResolvedValue('agente-da-campanha');
    const f = poolFalso({ active_ai_agent_id: null });
    await expect(transferirAgenteDaConversa(f.pool, ENTRADA)).rejects.toBeInstanceOf(TransferenciaDeAgenteRecusada);
    expect(f.consultas.some((c) => c.sql.includes('insert'))).toBe(false);
  });

  it('destino pausado ou sem versão publicada: recusa', async () => {
    carregar.mockResolvedValue({ agentId: 'agente-b', pausedAt: '2026-11-14T00:00:00Z' });
    await expect(transferirAgenteDaConversa(poolFalso({ active_ai_agent_id: null }).pool, ENTRADA)).rejects.toMatchObject({ codigo: 'agente_pausado' });
    carregar.mockResolvedValue(null);
    await expect(transferirAgenteDaConversa(poolFalso({ active_ai_agent_id: null }).pool, ENTRADA)).rejects.toMatchObject({ codigo: 'agente_inexistente' });
  });
});

describe('ferramentaDePassagemEntreAgentes', () => {
  const ctx = { organizationId: 'org-a', conversationId: 'conv-1', agenteAtualId: 'agente-a', jobId: 'job-1', noteRunError: vi.fn() };

  it('sem outro agente publicado, não há ferramenta', async () => {
    expect(await ferramentaDePassagemEntreAgentes(poolFalso({ active_ai_agent_id: null }, []).pool, ctx)).toBeNull();
  });

  it('com outro agente, a ferramenta lista os nomes e passa a conversa', async () => {
    const f = poolFalso({ active_ai_agent_id: 'agente-a' }, [{ id: 'agente-b', name: 'Financeiro', description: 'boletos e pagamentos' }]);
    const ferramenta = await ferramentaDePassagemEntreAgentes(f.pool, ctx);
    expect(ferramenta).not.toBeNull();
    expect(ferramenta!.description).toContain('- Financeiro: boletos e pagamentos');
    const r = await (ferramenta as unknown as { execute: (a: { destino: string }) => Promise<{ ok: boolean }> }).execute({ destino: 'Financeiro' });
    expect(r.ok).toBe(true);
  });
});
