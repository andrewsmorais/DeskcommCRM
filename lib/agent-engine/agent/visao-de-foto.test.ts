import { describe, expect, it } from 'vitest';

import { frameMediaBody } from '../edge/crm/get-lead-context';
import { AVISO_DE_FOTO_NAO_VISTA, corpoSemVisaoDeFoto, legendaDaFoto } from './visao-de-foto';

describe('agente que não vê fotos — o corpo da foto vira aviso e a legenda fica', () => {
  it('foto descrita com legenda: a descrição some, a legenda fica', () => {
    const corpo = frameMediaBody('image', 'quanto custa isso?', 'Um tênis azul de corrida.');
    const saida = corpoSemVisaoDeFoto(corpo);
    expect(saida).toContain(AVISO_DE_FOTO_NAO_VISTA);
    expect(saida).toContain('Legenda do cliente: quanto custa isso?');
    expect(saida).not.toContain('tênis azul');
  });

  it('foto descrita sem legenda: só o aviso', () => {
    expect(corpoSemVisaoDeFoto(frameMediaBody('image', null, 'Um recibo.'))).toBe(AVISO_DE_FOTO_NAO_VISTA);
  });

  it('foto sem descrição: o marcador vira aviso, a legenda crua é preservada', () => {
    expect(corpoSemVisaoDeFoto('[image]')).toBe(AVISO_DE_FOTO_NAO_VISTA);
    expect(legendaDaFoto('tem na cor preta?')).toBe('tem na cor preta?');
  });
});

import { fotoSemLeitorNoAtendimento } from '@/lib/messaging/media/derive';

describe('a descrição paga da foto só é pulada quando nenhum agente a lê', () => {
  it('sem agente publicado: descreve (pode haver outro leitor)', () => {
    expect(fotoSemLeitorNoAtendimento([])).toBe(false);
  });
  it('um agente vendo fotos basta para descrever', () => {
    expect(fotoSemLeitorNoAtendimento([{ image_vision_enabled: false }, { image_vision_enabled: true }])).toBe(false);
  });
  it('todos os agentes publicados desligaram: pula', () => {
    expect(fotoSemLeitorNoAtendimento([{ image_vision_enabled: false }, { image_vision_enabled: false }])).toBe(true);
  });
  it('coluna ausente vale o padrão do banco (ligado)', () => {
    expect(fotoSemLeitorNoAtendimento([{}])).toBe(false);
  });
});
