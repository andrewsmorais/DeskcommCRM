-- 0503 — buckets da base de conhecimento e do export de LGPD só pelo servidor.
--
-- Os buckets `ai-policy` (arquivos da base de conhecimento) e `lgpd-exports`
-- (o dossiê completo do titular, gerado num pedido de LGPD) tinham policies de
-- `storage.objects` que só pediam "é membro da organização do primeiro
-- segmento do caminho" — sem papel e sem MFA. Pela API do Storage, com a anon
-- key e o JWT dele, um LEITOR baixava o dossiê de qualquer titular da
-- organização (as rotas de LGPD exigem admin com MFA) e apagava e
-- substituía o arquivo de conhecimento que todo turno do agente consulta (o
-- envio exige gerente). Cobertura da auditoria de 04/11/2026.
--
-- Nenhum código do produto lê ou grava esses buckets com a sessão do usuário:
-- o envio, a indexação e o export usam a service role, e o PDF do LGPD sai por
-- URL assinada. Então as quatro policies saem — os dois buckets ficam só do
-- servidor, como o `brand-logos` já é.
drop policy if exists "tenant_read_ai_policy" on storage.objects;
drop policy if exists "tenant_write_ai_policy" on storage.objects;
drop policy if exists "tenant_delete_ai_policy" on storage.objects;
drop policy if exists "tenant_read_lgpd_exports" on storage.objects;
