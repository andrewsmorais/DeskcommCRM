# Needs validation

Leads without severity. None is a confirmed vulnerability. Do not send audit traffic to a deployment.

## The chatbot regex validator accepts patterns with many `?` or `{n,m}` quantifiers outside groups, which may stall the shared worker
- Fingerprint: `chatbot-regex-segura:uncounted-optional-and-bounded-quantifiers`
- Claimed root cause: `problemaDaRegex` (lib/chatbot/regex-segura.ts:86) counts as free repetition only `/[*+]|\{\d+,\}/`. The check at line 80 that covers `?`, `|` and `{n,m}` runs only for the inner text of a group followed by a quantifier (line 76). A pattern with no groups never reaches it. Chains of `?` or `{n,m}` atoms are thus unlimited apart from the 200-character cap, although on a 100-character input `{0,99}` behaves like `*` and N consecutive optional atoms give up to 2^N backtracking paths.
- Trace:
  - entrypoint: `app/api/v1/chatbot-flows/[id]/route.ts:77` — A user with role manager saves or publishes a flow. A `pedir_digitar` option with formato `regex` carries a pattern of up to 200 characters (lib/chatbot/passos.ts:141). The flow validation in lib/chatbot/validar.ts:132 calls problemaDaRegex, which returns null for a group-free pattern of `?` or `{n,m}` quantifiers.
  - propagation: `lib/chatbot/motor.ts:796` — When the contact's message arrives, the engine calls primeiraOpcaoQueBate(c.opcoes, ctx.mensagem). The same call is made again at line 819 for the reply path. The engine is imported by the agent-engine drain (lib/agent-engine/edge/crm/drain.ts:32).
  - propagation: `lib/chatbot/regras.ts:517` — For each option with formato `regex`, calls casaRegex(o.regex, bruto) with the raw contact message.
  - propagation: `lib/chatbot/regex-segura.ts:86` — Counts only `*`, `+` and `{n,}`. A pattern made only of `?` or `{n,m}` quantifiers outside groups has zero counted repetitions and returns null.
  - sink: `lib/chatbot/regex-segura.ts:98` — `new RegExp(padrao.trim(), "iu").test(texto.trim().slice(0, 100))` runs synchronously on the Node event loop with no deadline.
- Evidence:
  - `lib/chatbot/regex-segura.ts:86` — The free-repetition count uses `/[*+]|\{\d+,\}/g`. `?` and `{n,m}` are not counted.
  - `lib/chatbot/regex-segura.ts:80` — `?`, `|` and `{n,` are tested only on the inner text of a group that is followed by a quantifier (condition at line 76). A pattern without groups never reaches this test.
  - `lib/chatbot/regex-segura.ts:5` — The header (lines 4-8) states that a badly written rule can freeze the whole worker for every organization of the installation, and that a running `test` cannot be interrupted. Lines 18-19 claim a worst case of about 100^4 steps, which assumes only rules (3) and (4).
  - `lib/chatbot/pedir-digitar-opcoes.test.ts:115` — The committed "worst accepted rule" test measures only `\w*\w*\w*!`. The rejection list at line 103 has no chain of `?` or `{n,m}` atoms, so no committed test covers this shape.
  - `lib/chatbot/passos.ts:141` — The schema caps the option regex at 200 characters. This is the only other bound on the pattern.
  - `docker-compose.prod.yml:60` — The production compose file declares one `worker` service for the agent-engine. The default installation therefore has one worker process, not one per organization.
- Blockers:
  - No approved OS sandbox is available in this run, so the matching time of an accepted pattern (for example `a?` repeated 20 to 40 times followed by `!`, on 100 `a` characters) was not measured in the Node/V8 version of the worker image. Whether it is seconds, hours or negligible is a runtime fact.
  - V8 behaviour for this pattern shape is not a repository fact. An engine optimization could remove the exponential search, and the run did not observe either outcome.
  - Recovery is not established from source: whether the event that triggers the slow match is redelivered after the worker restarts (making the stall repeat), and whether a container healthcheck or supervisor restarts a worker whose event loop is blocked.
- Local plan: In an isolated process with no network, a 5-second CPU limit and a read-only copy of the repository, import problemaDaRegex and casaRegex from lib/chatbot/regex-segura.ts. Step 1: assert that problemaDaRegex returns null for 'a?' repeated N times + '!' for N = 16, 18, 20, 22, 24, and for 'a{0,99}' repeated K times + '!' for K = 3, 4, 5. Step 2: time casaRegex for each pattern on 'a' repeated 100 times, in increasing order, and stop at the first measurement above 1 second. A time that roughly doubles for each extra `a?` confirms exponential growth; flat times in microseconds refute the candidate. Use the same Node major version as Dockerfile.worker. Do not run inside a live worker.
- Owner-observed check: The owner checks, on their own installation and without any audit traffic: (1) that a single agent-engine worker container serves every organization; (2) whether an event_log event whose handler does not return is picked up again after the worker restarts; (3) whether anything restarts a worker whose event loop is blocked.

## The chatbot webhook block buffers the whole remote response before applying the 64 KB limit
- Fingerprint: `chatbot-webhook:response-buffered-before-64k-cap`
- Claimed root cause: chamarWebhookDoChatbot applies TETO_DA_RESPOSTA to the string returned by `res.text()` instead of limiting bytes while reading the stream; it does not check Content-Length and does not cap the decompressed size.
- Trace:
  - entrypoint: `app/api/v1/chatbot-flows/[id]/route.ts:77` — After requireSupportWrite, requireRole("manager") admits a tenant manager, who can publish a flow containing a webhook step whose https URL points to a server they control.
  - propagation: `lib/chatbot/executar.ts:1372` — When a contact message reaches the step, the worker (via lib/agent-engine/edge/crm/drain.ts) calls chamarWebhookDoChatbot with the step configuration.
  - propagation: `lib/chatbot/webhook.ts:122` — After the outbound URL and resolved-address guards pass, fetch is called with redirect manual and an 8 s AbortSignal; no response size limit is set.
  - sink: `lib/chatbot/webhook.ts:129` — `(await res.text()).slice(0, TETO_DA_RESPOSTA)` reads the entire decompressed body into a string before cutting it to 64 KB.
- Evidence:
  - `lib/chatbot/webhook.ts:129` — The slice is applied only after the full body has been read into a string.
  - `lib/chatbot/webhook.ts:15` — The header states the intended control: 'resposta lida até 64 KB'.
  - `lib/chatbot/webhook.ts:127` — The only bound on the read is AbortSignal.timeout(TEMPO_DO_WEBHOOK_MS), 8 seconds; there is no byte limit.
  - `docker-compose.prod.yml:72` — The worker service has `mem_limit: 512m` (with `restart: unless-stopped` at line 99), which contains the effect to a kill and restart of the worker container.
- Blockers:
  - No approved sandbox in this run: memory growth of the worker from a large or compressed response was not observed, so it is not established that one or a few calls can reach the 512 MB container limit within the 8-second window.
  - How much decompressed data the runtime's fetch delivers in 8 seconds on the target hardware and network is not a source fact.
  - Whether the installation hosts more than one organization (so that a manager of one tenant affects others through the shared worker), and how many webhook calls the worker runs concurrently in practice, are deployment facts.
- Local plan: In an isolated process with a 256 MB memory limit and no network, call chamarWebhookDoChatbot with `pularChecagemDeRede: true` and an injected `fetch` that returns a Response streaming 1 MB, 8 MB and 32 MB of the letter 'a'. Record process.memoryUsage().rss before and after each call. RSS growing with body size while the returned value stays within 64 KB confirms the missing bound; stop at 32 MB.
- Owner-observed check: The owner checks whether the installation has more than one organization served by the same worker container, and looks in the worker container's history (restart count and OOM-kill flag in `docker inspect`) for restarts that coincide with chatbot webhook calls in the worker log line 'chatbot: WebHook chamado'.

## Security CI job keeps the Anthropic API key readable while running actions and pip packages resolved by mutable references
- Fingerprint: `ci-seguranca-secret-with-mutable-actions`
- Claimed root cause: A long-lived provider key is injected at process level into a background process (seguranca.yml lines 113-118) in a job whose third-party actions and Python tools are referenced by tag or version range rather than commit SHA or hash. The integrity of the code sharing the runner with the secret therefore depends on upstream tag and package owners.
- Trace:
  - entrypoint: `.github/workflows/seguranca.yml:166` — Third-party action zaproxy/action-full-scan@v0.13.0 is resolved by tag at run time, so whoever controls that tag decides the code that runs on the runner. The same reference repeats at line 183. The same kind of mutable resolution applies to the pip installs of schemathesis (line 155) and garak (line 204).
  - propagation: `.github/workflows/seguranca.yml:118` — `nohup pnpm exec next start -p 3001 > /tmp/app.log 2>&1 &` leaves a background process running for the remainder of the job. It inherits the step environment, and later steps run as the same runner user.
  - sink: `.github/workflows/seguranca.yml:116` — `ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}` is set in the environment of the step that starts the background app process, so the provider key remains present on the runner while later third-party code executes.
- Evidence:
  - `.github/workflows/seguranca.yml:116` — The secret is set as an environment variable of the step that starts the long-running app process.
  - `.github/workflows/seguranca.yml:118` — The app is started with nohup in the background and is never stopped, so it outlives the step.
  - `.github/workflows/seguranca.yml:166` — zaproxy/action-full-scan is referenced by tag v0.13.0, not by commit SHA; repeated at line 183.
  - `.github/workflows/seguranca.yml:155` — schemathesis is installed from PyPI by version range (>=4.3,<5) with no hash pinning, after the secret-bearing process has started.
  - `.github/workflows/seguranca.yml:204` — garak is installed from PyPI by version range (>=0.17,<0.18) with no hash pinning, in the step that runs only when the secret exists.
  - `.github/workflows/seguranca.yml:270` — actions/upload-artifact@v7 is referenced by major tag and runs while the app process is still alive.
  - `.github/workflows/seguranca.yml:54` — supabase/setup-cli@v3 (third party, major tag) runs earlier in the same job and can persist changes on the runner.
  - `.github/actions/preparar-node/action.yml:83` — pnpm/action-setup@v6 (third party, major tag) runs earlier in the same job; actions/cache@v4 (line 78) and actions/setup-node@v7 (line 89) are also tag-referenced.
  - `.github/workflows/seguranca.yml:21` — Limiting control: triggers are only workflow_dispatch, push to one branch, and schedule (lines 21-32), with permissions contents: read (lines 34-35). No pull-request or fork-triggered path reaches the secret.
  - `.github/workflows/trivy.yml:9` — The sibling workflow states that its action is pinned by commit because a tag can be replaced by whoever controls its repository (pinned at line 44). That control is absent from the workflow that holds the secret.
- Blockers:
  - Whether the ANTHROPIC_API_KEY secret is actually configured in the repository or organization settings is not visible in source. Without it the value is empty and the path is inert (the workflow's own TEM_CHAVE guard at line 47 anticipates that case).
  - Whether the repository or organization enforces an allowed-actions policy or mandatory full-commit-SHA pinning in GitHub Actions settings is not visible in source. Such a policy would block the tag-referenced actions, though not the PyPI installs.
  - The disclosure requires an upstream compromise or tag move in a third-party action or PyPI package. That is an external event that cannot be observed or reproduced from this repository, so no result is demonstrated.
- Owner-observed check: The owner checks two things in the GitHub repository settings, without running anything. (1) Under Settings > Secrets and variables > Actions, whether ANTHROPIC_API_KEY exists at repository or organization level, and whether it is a dedicated key with a low spend limit or a key shared with production. (2) Under Settings > Actions > General, whether actions are restricted to an allow-list or required to be pinned to a full-length commit SHA. If the secret exists and no pinning policy is enforced, the exposure stands as described. Smallest source fix: pin every third-party `uses:` in .github/workflows/seguranca.yml and .github/actions/preparar-node/action.yml to a full commit SHA, as trivy.yml already does; install schemathesis and garak from a requirements file with --require-hashes; and use a dedicated spend-capped key for this job.

## Sticker save downloads a stored media path with the service role after only a prefix check, so a path with '..' segments may read an object outside the tenant folder
- Fingerprint: `storage-path-dot-segment:figurinhas-post-download`
- Claimed root cause: Tenant ownership of a storage object is decided by a string prefix check (startsWith) on a caller-supplied path that the storage client library later places unencoded in a URL path, where dot segments are resolved. The new sticker-save route adds a service-role download of that stored path and re-checks only the organization prefix.
- Trace:
  - entrypoint: `lib/schemas/messaging.ts:77` — The POST /api/v1/messages body field media_storage_path is accepted as any string of 1 to 500 characters, with no pattern.
  - propagation: `lib/messaging/media/upload-validation.ts:16` — Ownership is path.startsWith(`${orgId}/${conversationId}/`), so '..' segments after the prefix pass.
  - propagation: `app/api/v1/messages/_handler.ts:718` — The raw path is written to messages.media_storage_path in the row inserted with status queued, before any signing or send step.
  - propagation: `app/api/v1/figurinhas/route.ts:103` — The sticker-save route reads the message with the session client and requires only type sticker or image, not revoked, and media_storage_path.startsWith(`${orgId}/`).
  - sink: `app/api/v1/figurinhas/route.ts:105` — admin.storage.from('whatsapp-media').download(m.media_storage_path) runs with the service role. The bytes are converted, uploaded to the caller's sticker folder, and later exposed by GET through a signed URL.
- Evidence:
  - `app/api/v1/figurinhas/route.ts:105` — Service-role download of a path taken from the message row, guarded only by the organization-prefix check on line 103.
  - `lib/messaging/media/upload-validation.ts:8` — The comment says storage keys are literal with no traversal semantics. That is true of keys sent in a JSON body, but this key is placed in a URL path by the client library.
  - `app/api/v1/messages/_handler.ts:526` — isMediaPathOwnedBy is the only check on a caller-supplied media_storage_path before the row is inserted.
  - `node_modules/.pnpm/@supabase+storage-js@2.117.2/node_modules/@supabase/storage-js/src/packages/StorageFileApi.ts:926` — download() builds `${this.url}/${renderPath}/${_path}` and passes it to fetch; _getFinalPath (line 1536) only prefixes the bucket id and strips leading slashes, with no encoding or dot-segment handling.
  - `lib/supabase/fetch-do-servidor.ts:89` — Line number approximate. The admin client's fetch wrapper passes the URL string to globalThis.fetch after at most swapping the public base for the internal one; it does not validate or normalise the path.
  - `app/api/v1/figurinhas/route.ts:54` — GET returns signed URLs for every sticker in the organization's library, which is how the converted copy would reach the agent.
- Blockers:
  - No approved sandbox in this run, so no target code was executed and no request was observed.
  - Not observed: that the Storage API, on receiving the collapsed request `/object/whatsapp-media/<orgB>/<convB>/<file>` with the service-role key, returns the other tenant's object. The collapse itself follows from standard URL parsing in fetch but was not executed here.
  - Exploitation needs the exact key of a victim object (organization UUID, conversation UUID, random file name). No source-visible way for an agent of another tenant to learn such a key was found.
- Local plan: On a throwaway local Supabase with two dummy organizations, upload a small PNG to whatsapp-media/<orgB>/<convB>/x.png. As an agent of orgA, POST /api/v1/messages with type image and media_storage_path `<orgA>/<convA>/../../<orgB>/<convB>/x.png`, and confirm the row is stored even if the send fails. Then POST /api/v1/figurinhas with { message_id } for that row and check whether the response is 201 and GET /api/v1/figurinhas returns a sticker rendered from orgB's image. Stop at that single dummy object. A unit-level alternative is to assert that `new URL(base + '/object/whatsapp-media/a/b/../../c/d.png').pathname` ends in `/object/whatsapp-media/c/d.png`, and that both routes reject a path containing '.', '..', '%' or a backslash segment once fixed.
- Owner-observed check: The owner can query their own database for stored paths with dot or encoded segments: select count(*) from messages where media_storage_path ~ '(^|/)\.\.?(/|$)' or media_storage_path like '%\%%' escape '\'. Any non-zero count deserves review of those rows and of the stickers saved from them.

## vCard import re-scans the growing folded line on every continuation line (quadratic work on the shared Node process, before the 500-row cap)
- Fingerprint: `vcf-linhasLogicas-quadratic-fold`
- Claimed root cause: linhasLogicas does work proportional to the length of the accumulated logical line for every physical line (split, regex test, string rebuild), with no cap on continuation-line count or logical-line length, and the only bound applied before parsing is the 5 MB file size.
- Trace:
  - entrypoint: `app/api/v1/contacts/import/route.ts:84` — After requireSupportWrite and requireRole('agent') (lines 63-70), the handler reads a multipart upload from field 'file'. It is treated as vCard when the name ends in .vcf/.vcard or the MIME type is text/vcard (line 100).
  - propagation: `app/api/v1/contacts/import/route.ts:115` — The only bound applied before parsing is file.size <= CSV_MAX_BYTES (5 MB).
  - propagation: `app/api/v1/contacts/import/route.ts:131` — vcfParaLinhas(text) runs synchronously in the request handler. The CSV_MAX_DATA_ROWS check comes later, at line 151.
  - sink: `lib/contacts/vcf.ts:51` — For each physical line, anterior.split(':') scans the whole accumulated previous logical line and a regex tests its first segment. Lines 52 and 54 then replace it with a longer string.
- Evidence:
  - `lib/contacts/vcf.ts:54` — A line starting with space or tab is appended to the previous logical line; there is no limit on how many times or on the resulting length.
  - `lib/contacts/vcf.ts:47` — The whole text is split into physical lines with no cap on their number.
  - `lib/contacts/csv.ts:148` — CSV_MAX_BYTES = 5 * 1024 * 1024.
  - `app/api/v1/contacts/import/route.ts:151` — The 500-row cap is checked after the parser has finished, and it counts parsed cards, so a file with zero or one card passes it regardless of line count.
  - `Dockerfile:143` — The app image starts a single 'node server.js' process; the route handler runs on that process's event loop.
- Blockers:
  - No approved OS sandbox in this run, so the parser could not be executed. The actual wall-clock time of vcfParaLinhas on a worst-case 5 MB input in the shipped Node/V8 version is not measured, and it decides whether the stall is negligible or long enough to matter.
  - Not source-visible: whether the hosting reverse proxy (Traefik, CloudPanel or another in front of the app) enforces a request-body limit below 5 MB or a request timeout that changes the outcome. The repository's own Caddyfiles and next.config.ts set none.
- Local plan: In an isolated harness with no network and a CPU-time limit of about 60 s, import only lib/contacts/vcf.ts and call vcfParaLinhas on 'BEGIN:VCARD\nFN:x\n' followed by N lines ' a', for N = 10000, 20000, 40000, 80000. Record the time for each and check whether it roughly quadruples when N doubles. Repeat with a first line of 100 KB, 200 KB and 400 KB of 'a' followed by the same number of lines holding one space. Extrapolate to 5 MB; do not run the 5 MB case and do not run against a live app process.
- Owner-observed check: The owner can check two facts on the installation: (1) the maximum upload size and request timeout configured in the proxy in front of the app; (2) that the app service runs as one container with one Node process. No audit traffic should be sent to the deployment.

## Anonymous webchat sender can sidestep the per-visitor limit by rotating the token, and the per-IP limit too where the proxy appends X-Forwarded-For
- Fingerprint: `webchat-public-enviar:rate-limit-key-forwarded-ip+visitor-token-rotation`
- Claimed root cause: The enviar route's limits are keyed only on requester-influenced dimensions: the leftmost X-Forwarded-For value and a self-generated visitor token. There is no aggregate limit per channel or organization on rows created by new visitors, and getIp trusts the leftmost forwarded value regardless of which proxy wrote it.
- Trace:
  - entrypoint: `app/api/v1/webhooks/webchat/[chave]/enviar/route.ts:38` — Unauthenticated POST; tenant and channel resolved from the public path key.
  - propagation: `lib/rate-limit-helper.ts:44` — Client IP is the first comma-separated element of X-Forwarded-For, falling back to req.ip and then 127.0.0.1.
  - propagation: `app/api/v1/webhooks/webchat/[chave]/enviar/route.ts:41` — The 60/min counter is keyed on that IP string.
  - propagation: `app/api/v1/webhooks/webchat/[chave]/enviar/route.ts:59` — The 15/min counter is keyed on the SHA-256 of the visitor token from the request body, which the requester generates.
  - propagation: `lib/channels/webchat/ingest.ts:150` — An unseen token hash inserts a new contact for the tenant through the service-role client.
  - propagation: `lib/channels/webchat/ingest.ts:183` — A conversation is created for that contact and channel via fn_upsert_wa_conversation.
  - sink: `lib/channels/webchat/ingest.ts:86` — After the message insert, the shared post-entry step runs opt-out, lead creation, campaign check and emits ai_agent.dispatch_requested.
- Evidence:
  - `lib/rate-limit-helper.ts:45` — getIp reads the leftmost X-Forwarded-For value with no check on who wrote it.
  - `docs/runbooks/cloudpanel.md:235` — The documented nginx vhost sets X-Forwarded-For with $proxy_add_x_forwarded_for, which appends to the client-sent header instead of replacing it.
  - `lib/rate-limit.ts:6` — The limiter is a process-local Map; an entry is created per distinct key string and swept every five minutes, so it is per replica and has no aggregate dimension.
  - `lib/channels/webchat/config.ts:82` — The visitor token is any 43-character base64url string supplied by the requester; nothing issues or signs it server-side.
  - `lib/http/ip-do-cliente.ts:11` — The project's own note that forwarded headers can be forged by the requester when no proxy checks them.
  - `Caddyfile:47` — The default deployment uses plain reverse_proxy app:3000 with no trusted_proxies setting; how it treats a client-sent X-Forwarded-For is Caddy's default behaviour, not visible in source.
  - `docker-compose.prod.yml:407` — The Caddy image is the mutable tag caddy:2-alpine, so the exact proxy version and its forwarded-header default are not fixed by source.
  - `lib/channels/pos-entrada.ts:158` — The post-entry step requests an agent dispatch event for every newly stored inbound message, after the lead step at line 147; nothing here caps it per channel or organization.
  - `app/api/v1/channels/webchat/route.ts:86` — A webchat channel is created with metadataInicialDoCanal(), i.e. ai_gate 'allowlist' (lib/ai/elegibilidade/pre-go-live.ts line 82), so agent turns are closed by default; this bounds the AI-cost part of the claim, not the row creation.
  - `tests/seguranca/chat-no-site.spec.ts:125` — The committed security spec checks only that one visitor token sending repeatedly gets 429; no test covers token rotation or a varied forwarded address.
- Blockers:
  - No approved OS-enforced sandbox is available in this run, so the handler could not be executed against a local fixture to observe the response codes and row counts.
  - The reverse proxy actually in front of the app (Caddy default, hosting-panel Traefik, CloudPanel nginx, or a CDN) and whether it replaces or appends a client-sent X-Forwarded-For is a deployment fact outside source; it decides whether the 60/min per-IP bound can be sidestepped.
  - The number of app replicas is outside source; the limiter is per process, so the effective per-IP bound scales with the replica count.
- Local plan: In an isolated fixture with a dummy tenant and one webchat channel (status WORKING, no domain list), call the enviar POST handler 70 times within one minute, each with a fresh 43-character base64url token, a fresh uuid id, a short text, and a different first X-Forwarded-For value. Then repeat 70 times with fresh tokens but a constant X-Forwarded-For. Count the 201 and 429 responses and the rows created in contacts, conversations, messages, crm_leads and event_log for the dummy tenant. The claim holds if the first run returns no 429 and creates 70 contacts, and the second returns 429 only from the 61st request. Stop there; do not measure load.
- Owner-observed check: On the owner's own install, the owner sends one GET to /api/v1/webhooks/webchat/<own key> carrying a made-up X-Forwarded-For value (for example 203.0.113.7) and checks, by temporarily logging the header as received by the app container, whether the made-up value is still the first element. If it is, the proxy appends and the per-IP limit is bypassable on that install. The owner should also note how many app replicas run.
