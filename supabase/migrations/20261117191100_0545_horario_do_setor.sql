-- manifest: **Horário por setor.** `setores.horario` (jsonb, padrão `{}` = qualquer hora; o mesmo formato da jornada do atendente, com fuso e janelas por dia da semana). Fora do horário a distribuição de atendimento não entrega a conversa daquele setor: ela espera na Fila e é entregue quando o setor abre. Adaptado do produto original (9062 de lá). Idempotente.
-- Fatia 3 do O7 (docs/chataionline/o7-setores-fila.md). Adaptado do produto
-- original (9062 de lá: `attendant_sectors.schedule`) ao modelo daqui (0496).
alter table public.setores
  add column if not exists horario jsonb not null default '{}'::jsonb;

alter table public.setores drop constraint if exists setores_horario_objeto;
alter table public.setores add constraint setores_horario_objeto
  check (jsonb_typeof(horario) = 'object');

comment on column public.setores.horario is
  'Horário do setor ({timezone, windows:[{dow,start,end}]}, o mesmo formato de attendant_availability.schedule). {} = qualquer hora. Fora dele a distribuição (lib/routing/eligibles.ts) não entrega a conversa do setor: ela espera na Fila. Migration 0545.';
