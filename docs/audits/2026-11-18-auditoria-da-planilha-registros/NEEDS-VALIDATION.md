# Precisa conferir (NEEDS VALIDATION) — run-2

Pistas com caminho real no código, mas cuja conclusão depende de um fato que não dá para observar sem navegador real ou sem a VPS. **Não são achados confirmados e não têm gravidade.** Conteúdo técnico em inglês, como nos registros.

## Prospect site audit can be bypassed with DNS rebinding: the guard and fetch resolve the name separately, and the internal response is stored, shown to the tenant admin and fed to the outreach AI

- Fingerprint: `prospecting-site-fetch-dns-rebinding:lib/prospecting/site-fetch.ts:buscar`

### Description

buscar() approves each hop by resolving the hostname twice: criarVerificadorPadrao at site-fetch.ts:144, then assertDestinoResolvidoSeguro at outbound-ip.ts:104. It then calls the global fetch with the hostname URL; fetch resolves the name a third time, and nothing pins the connection to the vetted addresses. The URL is any http/https URL with any port. It comes from a tenant admin's own import spreadsheet (lib/prospecting/planilha.ts:194, safePublicLink checks only the protocol) or from third-party Google Maps listings (the website field from the Apify or Scavio providers, schema.ts:484). The verificar_sites and reanalisar_site actions and the automatic preparation tick all audit it. The fetch is not blind: up to 1200 chars of the response's title, headings and visible text are stored as data.site.conteudo_resumo, returned to the org admin by GET /api/v1/prospecting, and injected as 'Detalhe' into the AI prompt that writes the WhatsApp message to the listing's phone. The residual-risk note in outbound-ip.ts:11-13 and 88-91 rests on three assumptions: a manager+ insider author, a blind webhook, and pinning breaking TLS. None of them holds for this path, and lib/extensions/download.ts already pins the vetted addresses while keeping SNI. Code-level reproduction (verifier, sandbox): the guard saw a public address, fetch connected to 127.0.0.1, and the loopback page's text came back in conteudo_resumo. Real-world exploitability and impact depend on deployment facts listed as blockers.

### Claimed root cause

lib/prospecting/site-fetch.ts:229-235 checks hostLiberado(atual), which performs fresh DNS lookups (line 144 and outbound-ip.ts:104), and then calls fetchFn(atual, ...) with the unpinned hostname. The global fetch resolves again, a time-of-check to time-of-use gap, so an attacker-run authoritative DNS with TTL 0 can answer a public address to the guard and a private one to the connection.

### Trace

1. `app/api/v1/prospecting/importar/route.ts:35` (entrypoint, POST) — An org admin (session) imports a spreadsheet; its website column becomes data.website through siteDaCelula (lib/prospecting/planilha.ts:194), which accepts any http/https URL and port. The alternative source is provider listings (lib/prospecting/schema.ts:484).
2. `app/api/v1/prospecting/route.ts:438` (propagation, POST verificar_sites) — The admin's 'Verificar agora' runs enriquecerSitesPendentes for the campaign; reanalisar_site (line 328) calls auditarSite directly, and the tick does the same through lib/prospecting/preparo.ts:249.
3. `lib/prospecting/site-enrich.ts:134` (propagation, enriquecerSitesPendentes) — auditarSites(rows.map(r => r.website), ..., fetch, undefined, ...) uses the global fetch and the default verifier.
4. `lib/prospecting/site-fetch.ts:373` (propagation, auditarSite.tentar) — busca = await buscar(url, fetchFn, verificar)
5. `lib/prospecting/site-fetch.ts:229` (propagation, buscar) — hostLiberado: recusarSSRF, then two DNS lookups (line 144 and outbound-ip.ts:104) judge the address the name resolves to now.
6. `lib/prospecting/site-fetch.ts:231` (propagation, buscar) — fetchFn(atual) with the hostname URL performs a third, unpinned resolution and connects to whatever it returns.
7. `lib/prospecting/site-fetch.ts:456` (propagation, auditarSite.tentar) — conteudo_resumo = montarResumo(html) of the response, in a non-provisional verdict.
8. `lib/prospecting/site-enrich.ts:153` (propagation, enriquecerSitesPendentes) — The verdict, including conteudo_resumo, is merged into prospecting_candidates.data.site.
9. `app/api/v1/prospecting/route.ts:122` (sink, GET) — p.data, including site.conteudo_resumo, is returned to the org admin, and becomes 'Detalhe' in the AI outreach data (lib/prospecting/estrategia-site.ts:649).

### Evidence

- `lib/prospecting/site-fetch.ts:21` — The code declares the DNS-rebinding window between check and connect as a known residual risk, 'fora do modelo de ameaca desta fase'.
- `lib/automation/outbound-ip.ts:11` — The residual-risk reasoning assumes the URL author is a manager+ insider configuring a blind webhook; here the authors are a tenant admin or third-party listings, and the response is read back.
- `lib/automation/outbound-ip.ts:91` — It claims that pinning the IP 'muda o SNI/Host e quebra TLS'.
- `lib/extensions/download.ts:127` — pinnedLookup in the same repository connects only to the vetted addresses (passed as lookup at line 226) and keeps SNI (servername at line 228), so pinning is feasible.
- `lib/prospecting/planilha.ts:194` — The spreadsheet website cell is accepted as any http/https URL (safePublicLink checks the protocol only).
- `lib/prospecting/estrategia-site.ts:649` — The fetched text summary is added to the AI prompt data as 'Detalhe'.

### Exact blockers

- Whether the deployed resolver chain honors TTL 0, so that the guard's two lookups and fetch's lookup milliseconds later can get different answers, is a deployment fact not visible in the repository. The chain is musl getaddrinfo in the node:22-alpine image, then Docker's embedded DNS on the compose network, then the VPS upstream resolver.
- Which internal HTTP endpoints return useful content to a plain GET carrying the attacker's Host header from the app container decides the real data exposure. Candidates are cloud metadata (IMDSv1, DigitalOcean), host services on the Docker gateway, and compose services without authentication; WAHA and srh require keys, and a 401 is classified as nao-medido with no summary. This depends on the VPS provider and stack.
- Whether any installation that hosts several organizations has the off-by-default disparo_em_massa module enabled. Without it every prospecting route returns 404 and the path is unreachable; on a single-organization installation the tenant admin is usually also the operator.

### Resolution plan

**Local (bounded):**

Verifier's own reproduction in the network-less sandbox (agents/verifier-planilha/artifacts/evidence/site-fetch-rebinding.log; harness h/rebind.mts). Only dns.lookup and dns.promises.lookup were patched, before import, for two dummy names; everything else was the real auditarSite with its default verifier and Node 22 global fetch, against a dummy HTTP server on 127.0.0.1 inside the sandbox's own network namespace. rebind.test: lookups 1-2 (the guard) got 93.184.216.34, lookup 3 (fetch) got 127.0.0.1, and the server received 'GET / Host=rebind.test:<port>'. The verdict was a definitive site-ruim, HTTP 200, with conteudo_resumo holding the loopback page's title, h1 and text. Control internal.test (always 127.0.0.1): the guard blocked it (fora-do-ar) and the server received nothing. After a fix that resolves once, checks every address and connects through a pinned lookup (like lib/extensions/download.ts pinnedLookup, with servername for TLS), rerun the harness: no third lookup may happen, the loopback server must receive nothing, and the verdict must be fora-do-ar or nao-medido.

**Owner-observed (test install, never production data):**

The owner, on a staging copy of the VPS stack with throwaway data (not production prospects): inside the app container, run node to call dns.promises.lookup three times in quick succession against a test name on an operator-controlled authoritative DNS with TTL 0 that answers a public test IP twice, then a private test IP, and confirm whether the third call sees the private answer or whether Docker's embedded DNS or the upstream resolver pins the first. Then, from inside the app container, list which internal addresses answer an unauthenticated GET with a foreign Host header (169.254.169.254, the Docker gateway on common ports, the compose service names and ports) to size what a rebinding fetch could read. Finally, record whether the disparo_em_massa module is enabled on any multi-organization installation.

## Web Push subscriptions survive sign-out, sign-out-everywhere and password reset, and the next user of the browser cannot rebind them, so org conversation previews keep reaching a signed-out or shared browser

- Fingerprint: `web-push-subscription-survives-signout:push_subscriptions`

### Description

This diff turns Web Push on by default: completar_par_vapid generates the VAPID pair on install and on every update. Every signed-in page load registers the browser's push subscription in push_subscriptions, bound to (organization, user) by the unique endpoint (AppShell → useInboundMessageAlerts → syncPushSubscription → PUT /api/v1/notifications/push). None of the session-ending paths touches that binding: the signOut action, the signOutEverywhere action ('Sair de todos os dispositivos', scope global), updatePassword and the client AuthProvider.signOut. They only end the Supabase session and delete the active_org cookie. The DELETE /api/v1/notifications/push route has no caller in app, lib, hooks or components. The source also has no Clear-Site-Data header, no serviceWorker unregister and no pushManager unsubscribe outside the VAPID key mismatch branch. The only service worker is /notify-sw.js with scope '/'. When a different person signs in on the same browser profile, syncPushSubscription reuses the existing browser subscription and PUTs the same endpoint. That person can be a shared reception or clinic desk user, or a member of another tenant on the same install. The push_subscriptions_own policy (USING user_id = auth.uid()) makes the PostgREST upsert ON CONFLICT (endpoint) DO UPDATE fail with 42501. The route turns that into a 500 and the client ignores the response, so the endpoint stays bound to the previous user's org. For message.received, the event-log handler sends a payload with the contact label (name or formatted phone) as title, up to 140 characters of the message text as body, and a signed avatar URL valid for 300 s. message.group_received and Central notices are sent the same way. Each goes to every subscription of an active member who can see the conversation. notify-sw.js suppresses the notification only when a window of the origin is visible. Otherwise it calls showNotification without any session check. A lost or shared device that the owner signed out remotely therefore keeps receiving the previews whenever the browser runs with no visible CRM tab. Verifier's bounded check (agents/verifier-onda2/artifacts/evidence/push-rebind.log, throwaway Postgres 16 with the Supabase prelude and baseline.sql) used dummy users A (agent, org X), C (agent, org X) and B (agent, org Y). A's upsert succeeded. B's and C's upserts of the same endpoint failed with 42501 'new row violates row-level security policy (USING expression)'. B's DELETE-route equivalent removed 0 rows. The service-role delivery query of enviarAosUsuarios (organization X, user A) still returned the row. The installed schema has 0 triggers on push_subscriptions and 0 public/auth functions referencing it. Revoked members are already handled by removerPushDoMembro and the active-member filter; this candidate covers session invalidation and the next user of a browser only. Not observed locally because no browser is available: that the browser keeps the PushSubscription and service worker after the cookie-only sign-out, and that a push received afterwards is displayed. Fix direction: before the sign-out action, the client should getSubscription, DELETE /api/v1/notifications/push for that endpoint, then call unsubscribe(). signOutEverywhere and updatePassword should delete all push_subscriptions rows of the user with the service role. The PUT should handle an endpoint held by another user by deleting the old binding with the service role when the caller presents the same p256dh/auth keys. The 'alerts off' switch should also unsubscribe.

### Claimed root cause

The push_subscriptions binding is a long-lived delivery credential tied to (organization, user). At send time it is checked only against active membership and conversation visibility, never against a live session. No session-ending path revokes it, neither on the server (row delete) nor in the browser (PushSubscription.unsubscribe). The endpoint-unique upsert under the user_id = auth.uid() policy also stops the next signed-in user from replacing the binding, so the previous user's org previews keep flowing to that browser.

### Trace

1. `lib/notifications/push_client.ts:31` (entrypoint, syncPushSubscription) — On every signed-in load (AppShell → useInboundMessageAlerts.ts:116), the browser's existing push subscription is reused (or created) and its endpoint is PUT to the server
2. `app/api/v1/notifications/push/route.ts:72` (propagation, PUT) — Cookie-session upsert with onConflict 'endpoint' binds the endpoint to organization_id = active org and user_id = current user
3. `app/actions/auth/signOut.ts:14` (propagation, signOut) — Sign-out only ends the Supabase session and deletes the active_org cookie. The push row and the browser subscription are untouched; the same holds for signOutEverywhere.ts:17 (scope global) and updatePassword.ts:111
4. `supabase/baseline.sql:14986` (propagation, push_subscriptions_own policy) — The next user's PUT of the same endpoint reaches ON CONFLICT DO UPDATE on a row whose user_id is not auth.uid(). RLS raises 42501, the route returns 500 (route.ts:90) and the client ignores it, so the endpoint stays bound to the previous user's org
5. `lib/notifications/push.handler.ts:61` (propagation, handleInbound) — For message.received the handler builds a payload with the contact label as title, the message preview as body and a signed avatar URL, then sends it to everyone who can see the conversation
6. `lib/notifications/web_push.ts:106` (propagation, enviarAosUsuarios) — Selects subscriptions only by organization_id and active-member user_id; there is no session binding
7. `lib/notifications/web_push.ts:130` (propagation, enviarAosUsuarios) — webpush.sendNotification sends the preview to the stale endpoint
8. `public/notify-sw.js:48` (sink, push event listener) — The service worker shows the contact label and preview in the OS tray or lock screen whenever no window of the origin is visible, without any session check

### Evidence

- `app/actions/auth/signOut.ts:18` — The only cleanup on sign-out is store.delete('active_org'); there is no push subscription delete
- `app/actions/settings/signOutEverywhere.ts:17` — 'Sair de todos os dispositivos' calls only auth.signOut({scope:'global'}); the user's push_subscriptions rows remain
- `app/actions/auth/updatePassword.ts:111` — Password reset ends with a plain auth.signOut(); push rows remain
- `hooks/auth/AuthProvider.tsx:80` — Client signOut only resets realtime auth before the server action; there is no pushManager unsubscribe
- `app/api/v1/notifications/push/route.ts:105` — The DELETE handler exists, but nothing in app, lib, hooks or components calls it
- `app/api/v1/notifications/push/route.ts:90` — Any upsert error other than PGRST205, including the 42501 RLS violation, is returned as a 500 that push_client.ts:52 never inspects
- `supabase/baseline.sql:14969` — endpoint text not null unique: one browser endpoint can be bound to only one (org, user), and only that user can update it under RLS
- `lib/notifications/push_client.ts:38` — The only unsubscribe in the client is for a VAPID key mismatch, never for a user change or sign-out
- `lib/notifications/service_worker.ts:5` — The single service worker /notify-sw.js is registered at scope '/'; no code unregisters it
- `lib/notifications/web_push.ts:229` — removerPushDoMembro documents the intended invariant (a device of someone who lost access must not keep getting previews on its lock screen), but it is only called from the revoke route (team/[user_id]/revoke/route.ts:90)
- `hooks/notifications/useNotificationPermission.ts:24` — Turning alerts off tells the user 'Este navegador não vai mais avisar na bandeja', but it only sets a localStorage flag that the service worker never reads
- `app/app/settings/security/_client.tsx:245` — The sign-out-everywhere dialog promises that every device must log in again, yet push delivery to those devices continues
- `hostgator-setup-kit/_common.sh:1752` — completar_par_vapid creates the VAPID pair on install (install.sh:1808) and on every update (update.sh:84), so the push path is live by default after this diff
- `public/notify-sw.js:41` — The only suppression condition is a visible window of the origin; a browser with no visible CRM tab displays every push

### Exact blockers

- No browser is available in the sandbox, so two facts were not observed: that a Chromium or Firefox PushSubscription and the /notify-sw.js registration survive the server-action sign-out (cookie deletion only, no Clear-Site-Data), and that a push received afterwards is displayed by the service worker.
- Delivery from the server to a real browser goes through the browser vendor's push service (FCM or Mozilla autopush), which is external and unreachable offline. Local evidence stops at the service-role delivery query still returning the stale binding, plus the hunter's recorder showing webpush.sendNotification called for it.

### Resolution plan

**Local (bounded):**

Use Playwright Chromium against a local next build and next start, on a fresh baseline with a VAPID pair, two dummy orgs X and Y and dummy users A (agent, X) and B (agent, Y). (1) Log in as A, call context.grantPermissions(['notifications']) and wait for PUT /api/v1/notifications/push to return 200. (2) Use the user menu to 'Sair'. On /login, evaluate (await navigator.serviceWorker.ready).pushManager.getSubscription() and confirm it is non-null with the same endpoint. (3) Log in as B in the same context. Confirm the PUT returns 500 and that select organization_id, user_id from push_subscriptions where endpoint = that endpoint still returns (X, A). (4) Bring a non-CRM page to the front or close all CRM pages so no client of the origin is visible. Use the CDP command ServiceWorker.deliverPushMessage to deliver the JSON payload that montarPayloadDeInbound produces for an org X conversation. Confirm registration.getNotifications() lists a notification titled with the org X contact label. (5) Repeat from a fresh context, replacing step 2 with 'Sair de todos os dispositivos' issued from a second browser context.

**Owner-observed (test install, never production data):**

Owner-observed, on a test install with a dummy org and a test phone. In desktop Chrome (browser left running) or Chrome on Android, sign in as A and allow notifications. Sign out, or use 'Sair de todos os dispositivos' from another device, then close the CRM tab. Send a WhatsApp message from the test phone to the org number and check whether an OS notification with the contact name and message text appears on the signed-out browser. Then sign in as a user of a different org on that browser, close the tab, send another message, and check whether A's org preview still appears. Also confirm in the database that the push_subscriptions row for that endpoint is still bound to A.
