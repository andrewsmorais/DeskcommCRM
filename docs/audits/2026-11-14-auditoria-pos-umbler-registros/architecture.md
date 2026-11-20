# Architecture summary (scoped run: changes since 57e72291)

**Product.** Multi-tenant sales CRM (Next.js 16 App Router, React 19, TypeScript, Supabase Postgres/Auth/Realtime/Storage), self-hosted with docker compose (app, worker, scheduler, WAHA, Redis, Caddy). WhatsApp via WAHA is the main channel. Tenants are separated by `organization_id` + RLS (`fn_user_org_ids`). Roles: viewer < agent < manager < admin; platform admin and a support impersonator exist. Route handlers that use the service-role client (`createAdminClient`) bypass RLS and must filter `organization_id` taken from the session/token/path token, never from the body. Mutating `/api/v1` handlers call `requireSupportWrite()`; mutations write `api_audit_log`.

**Principals.** Anonymous website visitor (new webchat); end contact on WhatsApp (text reaches the chatbot engine); viewer/agent/manager/admin of a tenant; user of another tenant; support impersonator; CI on the fork.

**Comparable baseline.** Umbler Talk (docs/chataionline/comparacao-umbler-talk.md): a hosted omnichannel inbox with webchat, chatbots with custom regex, scheduled messages. Calibration only.

**In-scope features and entry surfaces.**
- Public, unauthenticated: `app/api/v1/webhooks/webchat/[chave]/{route,enviar/route,ler/route}.ts` → `lib/channels/webchat/{publico,config,ingest,adapter}.ts`; embed script `public/webchat/v1.js`. Tenant resolved from the path key (`webhook_path_token`); visitor identity = SHA-256 of a browser-generated token; in-memory rate limit (`lib/rate-limit.ts`), client IP from first `X-Forwarded-For` (`lib/rate-limit-helper.ts`); body cap 8 KB; optional Origin allow-list. Admin CRUD: `app/api/v1/channels/webchat/**`.
- Privacy controls: hidden phone (`lib/supabase/telefone-oculto-fetch.ts`, `lib/contatos/telefone-oculto.ts`, `lib/supabase/server.ts`, `app/api/v1/team/[user_id]/telefone/route.ts`, migration 0517); hidden conversation (`app/api/v1/conversations/[id]/visibilidade/route.ts`, `lib/inbox/visibilidade.ts`, 0510); private direct team chat (`app/api/v1/equipe/**`, 0515).
- Conversation features: scheduled messages (`app/api/v1/conversations/[id]/agendadas/**`, `lib/agendadas/**`, drain in `lib/agent-engine/edge/crm/drain.ts`, 0511); close with farewell; favorites and forward (`app/api/v1/messages/[id]/{favorita,encaminhar}/route.ts`, 0513); history download (`app/api/v1/conversations/[id]/historico/route.ts`, `lib/conversas/historico*.ts*`); auto-reassignment (`lib/conversas/reatribuicao.handler.ts`, 0514); attendant signature.
- Files: contact import CSV/vCard (`app/api/v1/contacts/import/route.ts`, `lib/contacts/vcf.ts`); stickers (`app/api/v1/figurinhas/**`, `app/api/v1/conversations/[id]/figurinha/route.ts`, `lib/figurinhas/figurinha.ts` using sharp, 0516).
- Chatbot engine: custom regex rule (`lib/chatbot/regex-segura.ts`, `regras.ts`), variables and company variables (`lib/empresa/variaveis.ts`, `lib/chatbot/motor.ts`, `links.ts`), webhook block (`lib/chatbot/webhook.ts`, `webhook-corpo.ts`, `executar.ts`), per-block stats CSV (`app/api/v1/chatbot-flows/[id]/estatisticas/route.ts`, 0512).
- Edge: `proxy.ts` (rejects JSON with NUL/lone surrogates on session routes), `next.config.ts` (minimal CSP), `Caddyfile*` (TRACE/TRACK/CONNECT → 405), contacts UUID guard and escaped tag filter (`app/api/v1/contacts/[id]/route.ts`, `_handler.ts`).
- Delivery: `Dockerfile*` (apk upgrade, npm/pnpm removed), `hostgator-setup-kit/{_common,update,install}.sh` (WAHA default bump), `.github/workflows/{seguranca,trivy}.yml`, `scripts/seguranca/**`, `scripts/zap/sessao.mjs`.

**Trust boundaries and strongest visible control.**
1. Visitor ↔ tenant data: path key → org from DB row; visitor token hash scopes the conversation; text-only read.
2. User ↔ other tenant: `requireRole` + RLS; admin-client writes filter `organization_id` from `authz.org.orgId`.
3. Lower role ↔ restricted data: RLS policies (0510–0517), `fn_can_view_conversation`, phone mask in the server session client only (fails open; admin-client reads and direct PostgREST with the user's JWT are not masked — a limitation already disclosed to the owner).
4. Contact/remote data ↔ shared worker: regex validator, outbound URL guard, 64 KB response slice.
5. Fork CI ↔ secrets: workflows run only on dispatch/push to one branch/schedule, `contents: read`.

**Local execution limits.** No OS sandbox with all required controls is available: agents do source review only (no builds/tests/servers). Docker daemon absent. Deployment facts not in source: proxy handling of `X-Forwarded-For`, replica count (in-memory limiter), existing baseline RLS/grants outside scope.

**Prior coverage.** Earlier rounds (v10–v12) ran elsewhere; their ledgers are not available here, so there is no compatible prior ledger and no carried record.

**Companions selected.** WEB-PROTOCOL-AND-AUTH (forwarded-header trust on the public routes), DATA-ISOLATION-AND-LIFECYCLE (tenant/owner enforcement, policy vs query, blobs, export, stale authorization), CLIENT-SIDE (embed widget, CORS, browser storage), RESOURCE-EXHAUSTION-AND-AVAILABILITY (regex, buffering, pre-auth work), SUPPLY-CHAIN-AND-RELEASE (CI, mutable inputs, update path).
