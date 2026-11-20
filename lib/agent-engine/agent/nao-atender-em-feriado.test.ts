/**
 * "Não atender em feriado nacional" (vindo do produto original): a régua pura
 * que o turno usa para adiar a resposta até o próximo dia útil.
 */
import { describe, expect, it } from 'vitest';

import {
  ehFeriadoNacionalNoFuso,
  lerFechadoEmFeriadoNacional,
  msAteAJanelaAbrir,
  msAteAJanelaAbrirPulandoFeriado,
  type JanelaDeAtendimento,
} from './janela-de-atendimento';

const SP = 'America/Sao_Paulo';
const janela: JanelaDeAtendimento = { timezone: SP, start: '08:00', end: '18:00', weekdays: [1, 2, 3, 4, 5] };
const feriado = (i: Date) => ehFeriadoNacionalNoFuso(i, SP);
const H = 3_600_000;

describe('não atender em feriado nacional', () => {
  it('a opção nasce desligada e só liga com true', () => {
    expect(lerFechadoEmFeriadoNacional(null)).toBe(false);
    expect(lerFechadoEmFeriadoNacional({ filters: { business_hours: {} } })).toBe(false);
    expect(lerFechadoEmFeriadoNacional({ filters: { business_hours: { fechado_em_feriado_nacional: 'sim' } } })).toBe(false);
    expect(lerFechadoEmFeriadoNacional({ filters: { business_hours: { fechado_em_feriado_nacional: true } } })).toBe(true);
  });

  it('Finados (segunda, 02/11/2026) às 10h: espera a terça às 8h', () => {
    const agora = new Date('2026-11-02T13:00:00Z'); // 10h em SP
    expect(feriado(agora)).toBe(true);
    expect(msAteAJanelaAbrir(janela, agora)).toBeNull(); // sem a opção, atende
    expect(msAteAJanelaAbrirPulandoFeriado(janela, agora, feriado)).toBe(22 * H);
  });

  it('sexta à noite antes de Finados: pula a segunda e espera a terça', () => {
    const agora = new Date('2026-10-30T23:00:00Z'); // sexta 20h em SP
    const ms = msAteAJanelaAbrirPulandoFeriado(janela, agora, feriado);
    expect(new Date(agora.getTime() + (ms ?? 0)).toISOString()).toBe('2026-11-03T11:00:00.000Z');
  });

  it('dia útil dentro do horário: responde na hora, igual a antes', () => {
    const agora = new Date('2026-11-04T13:00:00Z'); // quarta 10h em SP
    expect(msAteAJanelaAbrirPulandoFeriado(janela, agora, feriado)).toBeNull();
  });

  it('fuso inválido não vira feriado (falha aberta)', () => {
    expect(ehFeriadoNacionalNoFuso(new Date('2026-11-02T13:00:00Z'), 'Lua/Base')).toBe(false);
  });
});
