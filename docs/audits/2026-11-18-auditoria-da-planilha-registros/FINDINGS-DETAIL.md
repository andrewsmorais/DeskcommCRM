# Detalhe dos achados confirmados (gravidade média ou alta) — run-2

Gerado a partir de `findings.json` (registros finais, já revisados na Fase 5). O conteúdo técnico está em inglês, como nos registros; o resumo em português está em `REPORT.md`.

## [HIGH] An agent-chosen outbound media_url makes GET /api/v1/messages/[id]/media call any WAHA API path with the installation key and return the response

- Fingerprint: `outbound-media-url-replayed-as-waha-api-request:messages-media-get`
- Likelihood: medium — Requires an authenticated agent-role account in an organization with a WAHA channel. After that it takes two ordinary requests, with no race condition and no victim interaction. Any public hostname passes the send guard, and a direct PostgREST insert skips it entirely.
- Impact: high — A low-privileged tenant member gets authenticated read access to the WAHA admin API with the installation-wide key, and the response is relayed to them. On multi-organization installations this exposes every organization's session list, including connected account identity, and each session's groups. Where a connection enabled history storage, it also exposes that organization's chats and messages. Inside one organization, it exposes WAHA-side data that the agent's RLS scope does not cover. The exact data depends on WAHA's responses, which were not observed.
- Confidence: high — My own reproduction chained the real send handler and the real media route, adapter and fetcher on the same inserted row. The server made a request with the WAHA key to the path the author chose and relayed the body with status 200. The database check shows that no INSERT-side control exists and that the agent can read the row back. The only unobserved part is what a real WAHA returns per path, and those paths are ones the app's own client reads with the same key.

### Description

Any organization member with the agent role can create an outbound message whose media_url they choose. They can use POST /api/v1/messages (session cookie, or a dsk_ token with mcp:write), the MCP send tools, or a direct PostgREST insert into public.messages. The send-side anti-SSRF guard (assertUrlDeMidiaSegura) checks only the scheme, host text and resolved IP, never the path or query. It is skipped entirely when media_storage_path is also supplied, and a direct PostgREST insert never runs it. Any public host passes, because a later consumer keeps only the path.

The sender, or anyone else in the organization, can then open GET /api/v1/messages/{id}/media. When the row has no storage object (or signing fails), the route hands any non-null media_url to the WAHA adapter. It never checks the message direction. fetchWahaMedia drops scheme, host and port, keeps the path and query, resolves them against WAHA_API_BASE_URL, and adds the installation-wide X-Api-Key. The route then returns the upstream body and Content-Type with status 200. In effect, the message author picks an authenticated GET against the WAHA admin API and reads the answer.

One WAHA container and one key serve every organization's WhatsApp session, and each organization's session is named org_<8>_<32>. An agent of organization A can therefore first read /api/sessions?all=true, which lists every session's name, status, config and connected account (`me`). They can then read per-session resources of organization B. One example is /api/{session}/groups, which the app itself reads with the same key and which does not depend on the history store. Another is /api/{session}/chats and /api/{session}/chats/{chatId}/messages. Those return data only when that connection has the NOWEB history store enabled, which is off by default and opt-in per connection. Inside a single organization, the same mechanism exposes WAHA-side data, such as groups not enabled in the CRM and stored chats, that is not limited by the agent's RLS scope.

### Root cause

Two components disagree about what messages.media_url is. The send path stores it as an arbitrary external URL. It validates only scheme, host and resolved IP, skips that check when media_storage_path is present, and a direct PostgREST INSERT bypasses the API entirely, because the 0499 media-pointer trigger is BEFORE UPDATE only. The media read route treats every media_url, whatever the message direction, as a file reference that the provider advertised. Through the WAHA adapter, fetchWahaMedia then trusts its path and query and replays them with the installation-wide WAHA API key. The comment claiming SSRF is 'impossible by construction' covers only the host rewrite. Nothing limits the path to WAHA's file store or to the message's own session.

### Intended behavior

The media route should proxy only media that the provider advertised on an inbound message. The path should be limited to WAHA's file store (/api/files/...) for that message's own session, with no caller-controlled query. No message author should be able to choose the path or query of a server-side request made with the WAHA installation key.

### Trace

1. `app/api/v1/messages/route.ts:62` (entrypoint, POST /api/v1/messages) — resolveAuthDual accepts a session cookie or a dsk_ bearer token (mcp:write) with role agent or higher. sendMessageSchema allows media_url as any z.string().url() and media_storage_path as any 1–500 character string (lib/schemas/messaging.ts:77-78).
2. `app/api/v1/messages/_handler.ts:578` (propagation, sendMessageHandler) — assertUrlDeMidiaSegura runs only when media_url is present WITHOUT media_storage_path. The storage path check at lines 563-565 tests the {org}/{conv}/ prefix and literal characters only, not whether the object exists. A fake owned-looking path therefore skips the guard.
3. `lib/messaging/media/url-de-midia-externa.ts:42` (propagation, assertUrlDeMidiaSegura) — When the guard runs, it checks scheme, host text (assertSafeOutboundUrl) and resolved IP (line 43). The path and query are unconstrained, so https://<any public host>/api/<any WAHA path> passes.
4. `app/api/v1/messages/_handler.ts:755` (propagation, sendMessageHandler insertRow) — media_url (and media_storage_path at line 757) are inserted unchanged into the outbound row through the caller's client before any send happens. The row is kept whether the send succeeds or fails.
5. `app/api/v1/messages/[id]/media/route.ts:114` (propagation, GET /api/v1/messages/[id]/media) — The row is read through the caller's RLS client (select at line 57 does not load direction). When there is no storage path, or createSignedUrl fails (lines 89-102), any non-null media_url is passed to adapter.fetchInboundMedia with the message's own WAHA session (line 134).
6. `lib/channels/adapters/waha.ts:285` (propagation, wahaAdapter.fetchInboundMedia) — Passes the raw media_url to fetchWahaMedia. sessionRef is not used to limit the path.
7. `lib/messaging/media/waha-source.ts:29` (propagation, fetchWahaMedia) — Builds new URL(advertised.pathname + advertised.search, WAHA_API_BASE_URL) and fetches it with X-Api-Key = WAHA_API_KEY (lines 34-38). The upstream Content-Type is kept (line 47).
8. `app/api/v1/messages/[id]/media/route.ts:140` (sink, GET /api/v1/messages/[id]/media response) — Returns the upstream WAHA response body and Content-Type with status 200 to the authenticated caller.

### Evidence

- `lib/messaging/media/waha-source.ts:29` — Only scheme, host and port are dropped. Any path and query of the stored URL are replayed against the WAHA API base.
- `lib/messaging/media/waha-source.ts:36` — The installation-wide WAHA API key is attached to that request.
- `app/api/v1/messages/[id]/media/route.ts:57` — The route's select does not load direction, so outbound rows are treated like provider-advertised inbound media.
- `app/api/v1/messages/[id]/media/route.ts:114` — The provider fallback runs for any non-null media_url when no signed storage URL is produced.
- `app/api/v1/messages/_handler.ts:578` — The anti-SSRF guard is skipped when media_storage_path is also supplied. media_url is still stored at line 755.
- `lib/messaging/media/url-de-midia-externa.ts:42` — The guard judges only scheme, host text and (line 43) resolved IP. It never looks at the path a later consumer will request.
- `supabase/baseline.sql:49837` — The 0499 media-pointer trigger is BEFORE UPDATE OF media_url, media_storage_path only. No INSERT control on media_url exists, so an agent can also insert such a row directly through PostgREST.
- `supabase/baseline.sql:50461` — The restrictive INSERT policy lets agents insert only direction='outbound' rows. Inbound rows come only from service-role ingestion, so a direction check on the read route excludes every agent-written media_url.
- `lib/waha/client.ts:1167` — A single WAHA_API_BASE_URL/WAHA_API_KEY pair serves the whole installation.
- `lib/channels/nome-da-sessao.ts:59` — Each organization gets its own session name (org_<8>_<32>) inside that single WAHA.
- `lib/waha/client.ts:238` — The app's own WAHA session schema shows that session objects carry `me` (connected account) and config next to name and status. That is what /api/sessions returns for every session.
- `lib/waha/client.ts:548` — The app reads /api/{session}/groups with the same key. This was measured on real WAHA and returns the number's groups.
- `lib/waha/client.ts:669` — The app reads /api/{session}/chats/{chatId}/messages (and /api/{session}/chats at line 610) with the same key. These return history only when the connection enabled the NOWEB store.
- `lib/waha/client.ts:64` — The NOWEB store is disabled by default and is enabled per connection, which bounds what the chats/messages paths can return.
- `tests/unit/media-waha-source.test.ts:34` — The existing test treats the host rewrite as the anti-SSRF control and asserts that path and query are preserved. There is no assertion that limits the path.

### Conditions

- **authentication_level**: An authenticated browser session of an organization member, because the media route authenticates with the cookie session. The row can be written through the same session, a dsk_ token with mcp:write, MCP tools, or a direct PostgREST insert.
- **authorization_role**: Agent role or higher in the attacker's own organization, to create the outbound row (the RLS INSERT floor). Reading it back only requires being able to see that message.
- **system_configuration**: The conversation's channel session is a WAHA (QR) session in the attacker's organization, and WAHA_API_BASE_URL/WAHA_API_KEY are configured. This is the installation's default channel. In production the guard requires https, but any public host works because only the path is replayed.
- **data_state**: Cross-tenant impact needs other organizations' WhatsApp sessions on the same installation's WAHA, as in a reseller or agency installation. Chats and messages from /api/{session}/chats... exist only for connections that enabled history storage, which is off by default. Session listing and groups do not depend on it.
- **third_party_dependency**: What WAHA returns for each chosen GET path. The paths cited are ones the app's own WAHA client calls with the same key; the response contents were not observed against a real WAHA.

### Bounded local reproduction

**Principal:** An agent-role member of organization A, logged in through the browser, wants to read organization B's WhatsApp data. Organization B's number runs in the same WAHA container on the same installation.

**Inputs:**

- `POST /api/v1/messages {"conversation_id":"<own conversation>","type":"image","media_url":"https://93.184.215.14/api/sessions?all=true"}`
- `POST /api/v1/messages {"conversation_id":"<own conversation>","type":"image","media_url":"https://93.184.215.14/api/org_99999999_fedcba9876543210fedcba9876543210/chats?limit=5"}`
- `POST /api/v1/messages {"conversation_id":"<own conversation>","type":"image","media_url":"https://169.254.169.254/api/sessions?all=true","media_storage_path":"<org>/<conversation>/does-not-exist.jpg"}`
- `GET /api/v1/messages/<id of the message created above>/media`

**Instructions:**

1. Verifier's own bounded reproduction (evidence/waha-replay-vitest.log). In bin/sb (no network, read-only target, env -i allowlist, NODE_ENV=test), one vitest harness chained both halves on the SAME row. The real sendMessageHandler ran with the repository's shared handler double as the RLS client and an agent session actor ({type:'user'}). The exact row it inserted was then served to the real GET /api/v1/messages/[id]/media route, which used the real channel registry, WAHA adapter and fetchWahaMedia. Only the Supabase session and admin clients, auth and audit were faked. The admin fake returns only the attacker's own-org WAHA session and fails storage signing. Settings were WAHA_API_BASE_URL=http://waha:3000 and a dummy WAHA_API_KEY, and global fetch was a recorder answering with a dummy JSON body.
2. Cases: A, control: private-host media_url alone. B: public-IP media_url with path /api/sessions?all=true. C: public-IP media_url with another org's session path /api/<victim session>/chats?limit=5. D: private-host media_url plus an owned-looking but non-existent media_storage_path.
3. Database check (evidence/messages-insert-as-agent.sql → .log). In bin/sb --pg with the installed baseline, an agent of a dummy org was set as role authenticated with jwt claims. The agent inserted an outbound messages row with an arbitrary media_url and read it back with the same select the media route uses. As a control, the agent then tried the 0499-guarded UPDATE of media_url.

**Observed result:**

From my own reproduction (not the hunter's artifacts). Send side: A returned 422 unsafe_media_url with 0 inserts. B and C each inserted 1 row with direction=outbound and media_url stored unchanged (send status sent). D skipped the guard and inserted media_url=https://169.254.169.254/api/sessions?all=true; the final status was failed/storage_sign_failed and the row was kept. Read side, on those exact rows: for B the route made exactly one request, to http://waha:3000/api/sessions?all=true with headers {"X-Api-Key":"dummy-installation-wide-waha-key"}, and returned 200 application/json with the upstream body. For C the request went to http://waha:3000/api/org_99999999_fedcba9876543210fedcba9876543210/chats?limit=5 with the key, and returned 200. For D, signing failed, the route fell through to the same request to /api/sessions?all=true with the key, and returned 200. All 4 tests passed, exit 0. Database: authenticated has INSERT on public.messages, and fn_message_service_lock does not mention media_url. The agent's direct INSERT of an outbound row with an arbitrary media_url succeeded, and the agent read it back with direction=outbound and an empty media_storage_path. The only media_url trigger is BEFORE UPDATE: the agent's UPDATE of media_url raised media_pointer_server_only, but INSERT is not covered. What a real WAHA returns on each path was not observed.

### Remediation

Fix the read side, because a direct PostgREST insert bypasses any API-side guard. The primary control belongs in fetchWahaMedia: accept only WAHA file-store paths (/api/files/<file> or /api/files/<own sessionRef>/<file>) with no query, and pass the message's sessionRef down from the adapter. Never replay the path or query of an arbitrary stored URL. This alone removes the reach into the WAHA admin API and into other sessions for every row, whoever wrote it.

As defense in depth, the route can also proxy only direction='inbound' rows. Direction is the one discriminator the database enforces on INSERT: the restrictive RLS policy lets agents insert only outbound rows, while sent_via and external_id stay writable. This has a trade-off. Media the operator sends from the phone (lib/waha/ingest.ts:1203-1211) and imported history are also stored as outbound rows with a provider media_url, so with the direction gate their media appears only after the persist worker stores it, normally within the next drain minute. If that window matters, keep proxying outbound rows, but only through the restricted file-store path.

On the send side, also run assertUrlDeMidiaSegura whenever media_url is present, even with media_storage_path. Serve proxied bytes with nosniff and a sandbox CSP.

Update tests/unit/media-waha-source.test.ts, whose current case asserts that the query is preserved. Add these regression tests: an outbound row with media_url https://93.184.215.14/api/sessions makes GET /media return 404 with no fetch; fetchWahaMedia rejects /api/sessions, /api/<other session>/chats, /api/files/<other session>/x.jpg and any query; and a send with media_url plus media_storage_path still runs the URL guard.

`lib/messaging/media/waha-source.ts`

```
const SEGMENTO_DE_ARQUIVO = /^[A-Za-z0-9_.@-]+$/;

export async function fetchWahaMedia(
  mediaUrl: string,
  hintMime?: string | null,
  sessionRef?: string | null,
): Promise<FetchedMedia> {
  const base = process.env.WAHA_API_BASE_URL;
  let url: URL;
  try {
    const advertised = new URL(mediaUrl);
    // Only WAHA's file store, and only this message's session: any other API
    // path (sessions, chats, messages, groups) would be read with the
    // installation-wide key.
    const partes = advertised.pathname.split("/"); // ["", "api", "files", ...]
    const arquivo = partes.slice(3);
    const valido =
      partes[1] === "api" &&
      partes[2] === "files" &&
      advertised.search === "" &&
      (arquivo.length === 1 || arquivo.length === 2) &&
      arquivo.every((s) => SEGMENTO_DE_ARQUIVO.test(s) && s !== "." && s !== "..") &&
      (arquivo.length === 1 || (!!sessionRef && arquivo[0] === sessionRef));
    if (!valido) throw new Error("path");
    url = new URL(advertised.pathname, base ?? "");
  } catch {
    throw new Error("waha_media_untrusted_path");
  }
  // ...unchanged fetch with X-Api-Key, size checks and mime...
}
```

`lib/channels/adapters/waha.ts`

```
  async fetchInboundMedia(input: {
    sessionRef: string;
    url: string;
    hintMime?: string | null;
  }): Promise<FetchedMedia> {
    return fetchWahaMedia(input.url, input.hintMime ?? null, input.sessionRef);
  },
```

`app/api/v1/messages/[id]/media/route.ts`

```
    .select("id, direction, media_url, media_mime, media_storage_path, metadata, channel_session_id")
  ...
  // Provider fallback only for media the PROVIDER advertised on an inbound
  // message. Agents can only insert outbound rows (messages_insert_de_atendente),
  // so no author-chosen media_url ever reaches the provider with the channel key.
  if (msg.media_url && msg.direction === "inbound") {
    ...
    return new Response(new Uint8Array(media.buffer), {
      status: 200,
      headers: {
        "Content-Type": media.mime,
        "Content-Disposition": "attachment",
        "Content-Security-Policy": "sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=60",
        "X-Request-Id": requestId,
      },
    });
  }
```

`app/api/v1/messages/_handler.ts`

```
  // Every stored media_url passes the guard, with or without a storage path.
  if (input.media_url) {
    try {
      await assertUrlDeMidiaSegura(input.media_url);
    } catch (erro) {
      throw new ApiError(
        422,
        "unsafe_media_url",
        { motivo: erro instanceof Error ? erro.message : "unsafe_url" },
        ctx.requestId,
        "media_url recusada: o endereço não pode ser baixado pelo servidor.",
      );
    }
  }
```

## [MEDIUM] AI tool crm_set_conversation_sector moves any conversation in the organization, not only the conversation of the turn

- Fingerprint: `ai-turn-tool-conversation-unbound:crm_set_conversation_sector`
- Likelihood: low — It needs the 'escalar' package (or this tool) enabled, sectors configured, and a model that obeys injected customer text. The attacker needs no account, and target ids are easy to obtain because crm_list_conversations ships in the same package.
- Impact: medium — This affects the integrity and availability of other customers' service across the organization. Their conversations, private ones included, can be silenced for the AI with no expiry, taken from their human owner and pushed to a sector queue, and repeated calls scale to every listed conversation. The tool itself discloses no data, and there is no cross-tenant effect.
- Confidence: high — The real bridge, turn guard, handler and transfer service ran in the sandbox and acted on a conversation outside the turn. The other-org control shows the organization filter is the only check. The only stand-in is the PostgREST client double, which records the exact filters, patch and RPCs the code sends. LLM compliance is a stated condition and is reflected in the likelihood. It is not an uncertainty about the missing binding.

### Description

In an AI turn driven by an untrusted WhatsApp sender, the in-process MCP bridge offers the model crm_set_conversation_sector with a free conversation_id. The sender can be a 1:1 customer or, since 0528, any member of a group where a manager enabled 'IA responde'. The handler checks only that the conversation belongs to the organization, then runs transferirParaSetor with the service-role client. That call silences the AI on the target conversation for good (bot_silenced_until='infinity', active_ai_agent_id=null), releases a human owner who is not in the sector, and re-routes the conversation. Nothing binds conversation_id to the turn's conversation or contact. The bridge passes the turn contact into ctx (turnContactId/contatoDoTurno), but this handler never reads it. guardServiceTools only re-checks the turn's own service boundary. The product binds every sibling path that has the same effect. The engine's request_human_handoff silences only the turn's conversation. The chatbot sector step uses its own conversation. The agenda tools refuse another contact's appointment through turnContactId, and the code documents the unbound case as a defect ('o contato A, conversando, levava a IA a cancelar ... o compromisso do contato B — com a identidade da organização'). The HTTP route requires RLS visibility plus exigirControleDaConversa. The same 'escalar' package also gives the model crm_list_conversations, which lists every conversation id in the organization with hidden ones included. So customer-controlled text can make the agent take other customers' conversations, private ones included, away from the AI and from their human owners and push them to a sector queue, using the organization's authority. The pre-existing crm_assign_conversation (same file, packages 'escalar' and 'atender') has the same org-only scoping.

### Root cause

lib/mcp/tools/governance.ts:263-285 trusts the model-supplied conversation_id and scopes it only by ctx.organizationId before calling transferirParaSetor (lib/setores/servico.ts:125-217) with the service-role client. The AI-turn bridge (lib/ai/runtime/tools.ts wrapMcpTool) injects the turn contact into ctx, but it does not bind conversation selectors to the turn generically. This tool does not opt into the per-tool binding the agenda handlers use (exigeContatoDoTurno). guardServiceTools (lib/atendimento/fronteira-server.ts:138) validates only the current turn's own boundary, never the target.

### Intended behavior

In a customer-driven conversation turn, the agent may move only THIS conversation to a sector. The tool's own description says 'você para de responder nesta conversa'. This matches the engine handoff, the chatbot step and the agenda rule 'A IA num turno de conversa só mexe no compromisso de QUEM está falando'. A conversation_id other than the turn's conversation must be refused, with no side effect.

### Trace

1. `lib/agent-engine/agent/inbound-turn.ts:4166` (entrypoint, inbound turn for a WhatsApp message (1:1 or AI-enabled group)) — The turn builds the catalog tools with buildMcpTurnTools, passing only organizationId, jobId and contactId (the turn contact). No conversation binding is passed.
2. `lib/agent-engine/edge/crm/mcp-tools.ts:139` (propagation, buildMcpTurnTools) — pickToolsFromMcp gets role ai_operator (rank 3, above the tool's 'agent' floor), mcp:write scope, the service-role client cfg.supabase, and turnContactId/contatoDoTurno.
3. `lib/mcp/tools/conversations.ts:56` (propagation, crm_list_conversations (same 'escalar' package)) — Lists the organization's conversations with ocultas 'incluir' and returns their ids, which gives the model target ids belonging to other customers.
4. `lib/ai/runtime/tools.ts:250` (propagation, wrapMcpTool execute) — After the scope/role checks and the funnel gate (the tool is 'sem_funil', so it is allowed), the handler is called with the model's arguments unchanged.
5. `lib/atendimento/fronteira-server.ts:138` (propagation, guardServiceTools / guardServiceEffect) — The only per-effect guard checks that the turn's OWN boundary (its conversation) is still current. It never checks the target conversation.
6. `lib/mcp/tools/governance.ts:281` (propagation, crmSetConversationSector.handler) — Calls transferirParaSetor with input.conversation_id and only the organization from ctx.
7. `lib/setores/servico.ts:182` (sink, transferirParaSetor) — The service-role UPDATE on the chosen conversation sets setor_id, bot_silenced_until='infinity' and last_handoff_reason='setor', and clears active_ai_agent_id. It then releases the owner via fn_conversation_assign (line 201) and re-routes via fn_request_channel_routing (line 213).

### Evidence

- `lib/mcp/tools/governance.ts:240` — conversation_id is any UUID. No relation to the turn is required.
- `lib/mcp/tools/governance.ts:279` — Comment states that only the organization is trusted: 'a organização vem do contexto confiável, e a conversa e o setor são conferidos dentro dela'.
- `lib/mcp/tools/governance.ts:255` — The tool description given to the model promises the effect applies to 'nesta conversa'.
- `lib/mcp/tools/catalogo/governanca.ts:48` — The tool is offered in the 'escalar' package.
- `lib/mcp/tools/catalogo/atendimento.ts:85` — crm_list_conversations is in the same 'escalar' package (crm_get_conversation too, line 95).
- `lib/leads/escopo-de-funil.ts:70` — The tool is declared sem_funil, so the bridge's only target gate allows it unconditionally.
- `lib/agent-engine/edge/crm/mcp-client.ts:38` — The engine's MCP client is created with SUPABASE_SERVICE_ROLE_KEY, so RLS on conversations does not apply.
- `app/api/v1/agenda/agendamentos/_handler.ts:244` — Sibling control and stated threat model: in an AI turn, writes to another contact's appointment are refused (exigeContatoDoTurno, line 253). The comment describes contact A driving the AI to act on contact B's object as a defect.
- `lib/agent-engine/agent/human-handoff.ts:415` — Sibling: the engine handoff applies the same silence effect only to ids.conversationId of the turn.
- `app/api/v1/conversations/[id]/setor/route.ts:67` — Sibling: the human route requires RLS visibility (line 58) and exigirControleDaConversa before the same transfer.
- `lib/chatbot/executar.ts:2255` — Sibling: the chatbot sector step uses its own conversation id.
- `lib/mcp/tools/governance.ts:57` — The pre-existing crm_assign_conversation also scopes the model-supplied conversation_id only by organization before the service-role fn_conversation_assign. Same missing binding.

### Conditions

- **authentication_level**: None. Any WhatsApp number that can message the organization's connected channel, or any member of a group where a manager turned on 'IA responde'.
- **system_configuration**: The organization's published agent has crm_set_conversation_sector (the 'escalar' package, or the tool chosen individually), and at least one sector exists. For target ids: crm_list_conversations or crm_get_conversation from the same package, or any other source of a conversation UUID.
- **third_party_dependency**: The LLM follows customer-supplied instructions and calls the tool with another conversation_id. Model output is untrusted by design. Model compliance was not exercised locally.
- **data_state**: The target conversation exists in the same organization. It may be private or owned by an attendant.

### Bounded local reproduction

**Principal:** A WhatsApp sender with no CRM account, whose messages drive an AI turn of the organization's published agent.

**Inputs:**

- `crm_set_conversation_sector {"conversation_id":"c0000000-0000-4000-8000-0000000000b2","setor":"Financeiro"} executed inside an inbound_turn whose service boundary is contact c0000000-0000-4000-8000-0000000000a1 / conversation c0000000-0000-4000-8000-0000000000b1`
- `agents/verifier-conversa/artifacts/evidence/turno-setor-harness.txt (vitest harness plus scratch config; dummy in-memory tables)`

**Instructions:**

1. This is the verifier's own bounded harness, written independently of the hunter's artifact. Build the tool the way the engine turn does: pickToolsFromMcp({toolIds:['crm_set_conversation_sector'], ctx:{organizationId:O, role:'ai_operator', actor ai_agent, turnContactId:T}, contatoDoTurno:T, scopes mcp:read/mcp:write, pipelineIds:[], modulosLigados:[], capacidadesLigadas:[]}). Back it with a recording in-memory Supabase double holding the turn conversation CT (contact T), a victim conversation CV (contact V, is_private=true, assigned to a human), a conversation CX in another org, and sector 'Financeiro'.
2. Wrap the tools with guardServiceTools and execute inside withServiceJob(inbound_turn, boundary org O / contact T / conversation CT, revision 7), with a boundary reader that returns the current revision for CT.
3. Call execute({conversation_id: CV, setor: 'Financeiro'}). Controls: the same call with CX (another org), and with CT (the turn's own conversation).
4. Run inside sb verifier-conversa (no network, read-only repository, scratch-only writes): vitest run --config ./vitest.verif.config.mjs --reporter=verbose.

**Observed result:**

From agents/verifier-conversa/artifacts/evidence/turno-setor.log, 3/3 passed, exit=0, with details in agents/verifier-conversa/artifacts/evidence/turno-setor-result.json. With a current boundary for conversation CT, the call on the victim conversation CV returned {conversation_id: CV, setor_id: <Financeiro>, setor: 'Financeiro', setor_anterior_id: null}. It issued UPDATE conversations SET setor_id=<Financeiro>, bot_silenced_until='infinity', last_handoff_reason='setor', active_ai_agent_id=null, active_intent=null WHERE organization_id=O AND id=CV, then rpc fn_conversation_assign(p_conversation_id=CV, p_to_user_id=null, p_reason='release'), then rpc fn_request_channel_routing(CV). Conversation CT was unchanged. Control CX (other org): the bridge returned {error: 'conversa_nao_encontrada'} with zero effects, which shows the organization filter is the only check. Control CT: the turn's own conversation is handled exactly like the victim's. The RPCs are recorded by the double, not executed. The effect of the service-role release on a real baseline (owner unassigned and losing sight) was observed separately in agents/verifier-conversa/artifacts/evidence/convidado-controle.log, case V3.

### Remediation

Bind the target to the turn. When ctx.actor.type is 'ai_agent' and the call comes from a customer-driven turn (a current execution boundary or a turnContactId exists), accept only the conversation of currentExecutionBoundary(). Without a boundary, require conversations.contact_id === ctx.turnContactId. Otherwise return a refusal the model can read, with no side effect. Calls with no turn context keep today's behavior. Preferably enforce this once in wrapMcpTool for every write tool whose arguments carry conversation_id or contact_id, and cover crm_assign_conversation and crm_manage_tags the same way. Regression test: calling with another conversation returns the refusal and records no UPDATE or RPC, while calling with the turn's conversation still succeeds.

`lib/mcp/tools/governance.ts`

```
import { currentExecutionBoundary } from "@/lib/atendimento/fronteira-server";
// inside crmSetConversationSector.handler, before resolving the sector:
if (ctx.actor.type === "ai_agent") {
  const fronteira = currentExecutionBoundary();
  if (fronteira || ctx.turnContactId) {
    let daConversaDoTurno = false;
    if (fronteira) {
      daConversaDoTurno = fronteira.conversation_id === input.conversation_id;
    } else {
      const { data: alvo, error: erroAlvo } = await ctx.supabase
        .from("conversations")
        .select("contact_id")
        .eq("organization_id", ctx.organizationId)
        .eq("id", input.conversation_id)
        .maybeSingle();
      if (erroAlvo) throw new Error(erroAlvo.message);
      daConversaDoTurno = (alvo as { contact_id?: string } | null)?.contact_id === ctx.turnContactId;
    }
    if (!daConversaDoTurno) {
      return {
        permitido: false,
        motivo: "conversa_de_outro_contato",
        mensagem: "Só é possível passar para um setor a conversa que você está atendendo agora.",
      };
    }
  }
}
```

## [MEDIUM] System update/rollback/force dispatch accepts read-only-scope platform admins and password-only (aal1) sessions of admins with an enrolled MFA factor

- Fingerprint: `app/api/v1/system/update/route.ts:POST:platform-admin-without-scope-full-or-mfa-step-up`
- Likelihood: low — Requires a platform-admin principal: either the DBA-provisioned support_readonly scope or the password of a full-scope admin who enrolled a factor, without the second factor. Tenant users and anonymous callers cannot reach it.
- Impact: medium — Bypasses both the read-only scope and the MFA step-up for the only app path that triggers a root-run host operation. The host agent then takes a backup, raises the maintenance pause, re-applies the baseline and swaps images, or after a failed run performs a forced rollback or re-run. The impact is on the availability and version integrity of the whole installation. The attacker cannot choose an arbitrary target through this route alone (it is derived from latest_version or the failed run's from_version), and there is no direct data disclosure.
- Confidence: high — Every trace line was re-read in source. An independent bounded harness ran the real route and sibling guards for three principals plus controls, and a throwaway Postgres confirmed that a support_readonly admin resolves as is_platform_admin while the DB rule refuses it. Upstream v1.116.0 applies exactly the missing guard to this route.

### Description

POST /api/v1/system/update is the endpoint behind "Atualizar agora", "Voltar para a versão anterior" and "Forçar atualização". It writes a dispatched system_update_runs row through the service-role client. On its next 5-minute cron, the host update agent executes that row as update.sh. update.sh takes a backup, puts up the maintenance page, re-applies the baseline, swaps images and restarts; for rollback and force it adds --force. The only authorization the route performs is user.is_platform_admin. That flag is true for any non-revoked platform_admins row, whatever its scope and whatever the session's assurance level. As a result, a platform admin with scope 'support_readonly' can dispatch an update, a rollback or a forced re-run. So can anyone who holds only the password of a platform admin who enrolled TOTP, from an aal1 session that never passed the second factor. Every sibling instance-write path refuses the same principals: the extension install/update/remove guard, escritaDeAdminOuRecusa/requirePlatformAdmin, the platform shortcut in requireRole, and the DB rule fn_support_write_allowed. The documented contract (docs/specs/01-spec-platform-base.md:182) says that platform_admins.scope sets the maximum authority and that anyone with a verified factor must prove aal2 on protected routes. Calibration against the comparable baseline: upstream release v1.116.0, whose tag is present in this clone, gates this same route with requirePlatformAdminEscrita() (scope='full' plus strict MFA), with the comment 'support_readonly e sessão com dívida de MFA não disparam'. The fork's port omitted that guard. lib/auth/recusa-de-escrita-de-admin.ts:5 still names requirePlatformAdminEscrita, which does not exist in the fork.

### Root cause

app/api/v1/system/update/route.ts:57 gates only on user.is_platform_admin. lib/auth/server.ts:273 derives that flag as !!paRow from a platform_admins read that selects only user_id and revoked_at (server.ts:178), so scope is never consulted. The route never calls sessionAal() or mfaEmDivida() and never reads mfa_required. proxy.ts applies its platform check only to /admin paths (proxy.ts:180), and it has no MFA step-up for /api. The route then writes through createAdminClient (route.ts:61). The service role bypasses the DB-side rule fn_support_write_allowed (migration 0501), which would refuse scope<>'full' or mfa_required without aal2.

### Intended behavior

Dispatching a host-affecting update, rollback or forced re-run should require platform_admins.scope='full'. It should also require aal2 whenever platform_admins.mfa_required is true or the user has a verified factor (mfaEmDivida()), and it should refuse an active support session. That is what requireExtensionPlatformFor (lib/extensions/http.ts:70,80) and escritaDeAdminOuRecusa enforce for other instance-level writes, and what upstream's requirePlatformAdminEscrita enforces on this same route. A support_readonly admin should get 403 forbidden, and a password-only aal1 session of an admin with a factor should get 403 mfa_required, with no system_update_runs row created.

### Trace

1. `app/api/v1/system/update/route.ts:49` (entrypoint, POST) — Cookie-session POST. The body selects the order: {} (update), {rollback:true} or {force:true}.
2. `app/api/v1/system/update/route.ts:50` (propagation, POST) — requireSupportWrite() only refuses an active read-only support SESSION. For a platform admin outside support mode it returns null.
3. `lib/auth/server.ts:178` (propagation, loadAuthUser) — The platform_admins read selects only user_id and revoked_at. Neither scope nor mfa_required is read, and no assurance level is computed.
4. `lib/auth/server.ts:273` (propagation, loadAuthUser) — is_platform_admin = !!paRow, so it is true for a support_readonly row and for any session level.
5. `app/api/v1/system/update/route.ts:57` (propagation, POST) — The only authorization gate is is_platform_admin. There is no scope='full' check and no aal2/mfaEmDivida check.
6. `app/api/v1/system/update/route.ts:241` (propagation, POST) — Service-role insert of {status:'dispatched', to_version: alvo}. alvo is latest for an update, or v<from_version> of the last failed run for rollback and force (lines 137, 180, 237).
7. `app/api/v1/system/agent/route.ts:227` (propagation, POST heartbeat) — The next host heartbeat receives update_requested:true and the run's to_version.
8. `hostgator-setup-kit/agent.sh:463` (sink, agent.sh main) — The host agent cron runs update.sh --to <alvo>, adding --force for older targets (backup, maintenance pause, baseline re-apply, image swap/restart or downgrade).

### Evidence

- `lib/extensions/http.ts:70` — The sibling instance-level guard (extension install/update/remove) refuses platform.scope !== 'full'.
- `lib/extensions/http.ts:80` — The same guard requires aal2 when mfa_required is set, or whenever mfaEmDivida() (a verified factor in an aal1 session) applies.
- `lib/auth/escritaDeAdminOuRecusa.ts:15` — Platform-write helper used by server actions in this diff: it returns forbidden_scope unless scope is 'full', after requirePlatformAdmin's MFA check.
- `lib/auth/requirePlatformAdmin.ts:62` — The platform admin surface requires aal2 when mfa_required is set or a TOTP factor is verified.
- `lib/auth/require-role.ts:125` — The platform-admin shortcut in requireRole refuses sessions for which mfaEmDivida() is true.
- `supabase/baseline.sql:43234` — The installed fn_support_write_allowed (0501, the last definition) denies platform writes when scope<>'full' or when mfa_required is set without aal2. The service-role route never reaches this rule.
- `supabase/baseline.sql:1800` — The platform_admins.scope CHECK admits 'support_readonly' as a defined read-only platform scope.
- `docs/specs/01-spec-platform-base.md:182` — Contract: platform_admins defines maximum authority and scope, and anyone who has a verified factor must prove aal2 on protected routes.
- `lib/auth/recusa-de-escrita-de-admin.ts:5` — Names requirePlatformAdminEscrita, the upstream instance-write guard that upstream v1.116.0 applies to this route. The guard is absent from the fork, which shows that the port dropped it.
- `proxy.ts:180` — The global proxy's platform check covers only /admin paths. Nothing adds an MFA step-up for /api/v1/system/update.

### Conditions

- **authorization_role**: A platform_admins row with scope='support_readonly' (read-only support staff provisioned by the DBA), or a full-scope platform admin whose credentials are partially compromised.
- **authentication_level**: For the full-scope case: an aal1 (password-only) session of an admin who has a verified TOTP factor or mfa_required=true, for example a stolen password before the MFA challenge.
- **data_state**: Rollback and force require the latest run to be failed or failed_rolled_back. A plain update requires latest_version != current_version. A dispatched run older than 15 minutes is expired and replaced; a fresher one blocks with 409.
- **system_configuration**: The host update agent cron is installed (setup_update_agent_cron, every 5 minutes).

### Bounded local reproduction

**Principal:** A platform administrator whose platform_admins row has scope 'support_readonly', or anyone holding only the password of a platform admin with an enrolled TOTP factor (session at aal1), calling the API directly with that session cookie.

**Inputs:**

- `POST /api/v1/system/update body {}`
- `POST /api/v1/system/update body {"rollback":true}`
- `POST /api/v1/system/update body {"force":true}`
- `principal P1: platform_admins {scope:'support_readonly', mfa_required:true}, verified TOTP, currentLevel aal1`
- `principal P2: same row, currentLevel aal2`
- `principal P3: platform_admins {scope:'full', mfa_required:false}, verified TOTP, currentLevel aal1`
- `SQL: as role authenticated with request.jwt.claims {sub:<support_readonly user>, aal:'aal1'}: select user_id, revoked_at from public.platform_admins where user_id=<sub> and revoked_at is null`

**Instructions:**

1. Verifier's own reproduction (not the hunter's harness). Inside the parent sandbox (no network), run vitest on harness/verif-update.test.ts (copied to evidence/system-update-verif-harness.txt). It imports the real route, lib/auth/server.ts, lib/impersonate/support.ts, lib/extensions/http.ts, lib/auth/escritaDeAdminOuRecusa.ts and requirePlatformAdmin.ts. Only the two Supabase clients (backed by one in-memory store), next/headers, next/navigation, audit, logger and env are faked.
2. For each of P1, P2 and P3, record mfaEmDivida(), requireExtensionPlatform() and escritaDeAdminOuRecusa(). Then call the real POST with {} (system_version current 1.1.0, latest 1.2.0), and with {rollback:true} and {force:true} (last run status 'failed', from_version '1.0.0'). Record the HTTP status and the dispatched system_update_runs row.
3. Controls: a user with no platform_admins row must get 403, and a full-scope aal2 admin must be accepted by both requireExtensionPlatform and the route.
4. In a throwaway Postgres 16 with baseline.sql applied (sb --pg), run evidence/platform-scope-verif.sql. It inserts a support_readonly admin (mfa_required=true) and a full admin, then executes loadAuthUser's exact platform_admins read as role authenticated with aal1 claims, and compares fn_is_platform_admin() with fn_support_write_allowed().

**Observed result:**

Verifier's bounded reproduction (evidence/system-update-verif.log, evidence/platform-scope-verif.log). P1 (support_readonly, aal1, TOTP): mfaEmDivida()=true; requireExtensionPlatform returned 403 forbidden; escritaDeAdminOuRecusa redirected to /login/mfa. The update route still returned 200 for {} and inserted {from_version:'1.1.0', to_version:'1.2.0', status:'dispatched'}. It returned 200 for {rollback:true} and for {force:true}, each inserting a dispatched run to 'v1.0.0'. P2 (support_readonly, aal2): requireExtensionPlatform returned 403 forbidden and escritaDeAdminOuRecusa returned {ok:false, error:'forbidden_scope'}, but all three route calls returned 200 with dispatched rows. P3 (full scope, password-only aal1 with a verified TOTP): requireExtensionPlatform returned 403 mfa_required, but all three route calls returned 200 with dispatched rows. In the controls, the non-admin got 403 with no row, and the full-scope aal2 admin got {ok:true} and 200. In Postgres, as authenticated with aal1 claims, the support_readonly user's loadAuthUser read returned its own row (scope support_readonly, mfa_required t). fn_is_platform_admin() was t, while fn_support_write_allowed(org) was f. The full admin at aal1 also resolved fn_is_platform_admin()=t. The installed fn_is_platform_admin has no scope filter, and platform_admins_self is the only policy.

### Remediation

Gate the route with the instance-write guard: refuse an active support session, require platform_admins.scope='full', and require aal2 when mfa_required is set or mfaEmDivida() is true. The cleanest fix is to port upstream's requirePlatformAdminEscrita/falhaDaEscritaDePlatformAdmin (which recusa-de-escrita-de-admin.ts already expects) and call it here, so that extensions, server actions and system update share one guard. Add regression cases: support_readonly gets 403 and no row; a full-scope aal1 session with a verified factor gets 403 mfa_required and no row; a full-scope aal2 session gets 200.

`app/api/v1/system/update/route.ts`

```
import { mfaEmDivida, sessionAal } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
// ...
  const user = await loadAuthUser();
  if (!user) return fail("unauthenticated", "Faça login para continuar.", 401);
  if (!user.is_platform_admin || user.support) {
    return fail("forbidden", "Só o dono do servidor pode atualizar o sistema.", 403);
  }
  // Updating the server is an INSTANCE WRITE: scope 'full' and the MFA proof the policy or an enrolled factor demands.
  const sb = await createClient();
  const { data: pa, error: paErr } = await sb
    .from("platform_admins")
    .select("scope, mfa_required")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (paErr) return fail("upstream_unavailable", "Não foi possível confirmar a permissão de acesso.", 503);
  if (!pa || pa.scope !== "full") {
    return fail("forbidden", "Seu acesso à administração da plataforma é somente leitura.", 403);
  }
  if ((pa.mfa_required && (await sessionAal()) !== "aal2") || (await mfaEmDivida())) {
    return fail("mfa_required", "Confirme a verificação em duas etapas nesta sessão.", 403);
  }
```

## [MEDIUM] Any tenant member, even a viewer, can forge appointment events that make the org's WhatsApp number send spoofed appointment notices, suppress real ones, and use up the number's shared daily send cap

- Fingerprint: `aviso-de-agendamento:appointment-event-forged-via-emit-event`
- Likelihood: medium — Needs only an authenticated viewer session in the target org, a listable appointment id, and the opt-in notice turned on. The attack is one PostgREST RPC call per message, and 20 calls use up a warm-up number's daily cap.
- Impact: medium — Within one tenant: spoofed cancellation and new-booking notices on the owner's trusted business channel, which invite double booking; suppression of real held notices; and exhaustion of the per-number daily cap (20 on numbers in first-day warm-up, otherwise up to daily_message_limit, default 300), which AI replies and campaigns share, until local midnight. No cross-tenant access.
- Confidence: high — The verifier reproduced both halves independently. The DB half ran against the installed baseline with controls. The handler half used the real rule and pacing code with fakes that mirror the production adapter's SQL semantics. Not exercised: the PostgREST gateway, the live WAHA transport and the Supabase-backed adapter itself, all standard parts of the deployment.

### Description

Migration 0551 adds an event_log consumer (agenda-aviso-no-whatsapp.v1). It turns every pending appointment.created, appointment.rescheduled and appointment.cancelled row into a WhatsApp message sent from the organization's connected number to the configured owner phone. These three types are not reserved in the installed public.emit_event. That function is SECURITY DEFINER, EXECUTE is granted to authenticated, it only requires viewer membership, and it records no actor. The consumer trusts the row. It takes the appointment id and the origin label (payload.autor) from the caller-chosen payload. It checks only that the appointment exists and, for created/rescheduled, that it is pending or confirmed. It claims one delivery per event_log id. A viewer cannot create, reschedule or cancel appointments (fn_appointment_change_core requires agent) and cannot configure or test the notice (admin-only). Yet a viewer can do three things. (a) Make the owner receive 'agendamento cancelado ... Origem: Cliente' for an appointment that is still confirmed, which invites a double booking. (b) Cancel a real notice that is still held (spacing or cap deferral, or night hold) for the same appointment, so the real notice is never sent. (c) Emit one row per message to use up the number's daily send cap in pacing_ledger. That cap is the lower of the warm-up step (20 per day for a number without a channel_knobs row) and channel_sessions.daily_message_limit (default 300). AI-agent replies and campaigns read the same ledger and the same cap, so for the rest of that local day they are vetoed and rescheduled to the next day's sending window (07:00 local by default). Each send is audited as system with bypassedRls and no actor, and event_log has no actor column, so the product does not attribute the forged sends to the member.

### Root cause

A new side-effecting consumer treats login-emittable domain events as authoritative commands. The installed emit_event refuses, for logged-in callers, message.received, appointment.outcome_confirmed, ai.case_opened/closed (supabase/baseline.sql:42958) and *_requested/user.mentioned (42971), but not appointment.created/rescheduled/cancelled. Those types stay open because the legitimate emitter (app/api/v1/agenda/agendamentos/_handler.ts:1161) calls emit_event with the session client. aplicaAvisoDeAgendamento checks neither the row's provenance nor that an announced cancellation matches the stored appointment state before it cancels pending deliveries or sends.

### Intended behavior

Only a real appointment transition by an authorized actor (agent+ through the agenda route or the AI tool, or Google sync on the server) should produce an owner notice or cancel a held one. A member below that floor must not be able to cause outbound WhatsApp sends from the org's number, spoof their content or origin, suppress real notices, or use up the number's daily cap.

### Trace

1. `supabase/baseline.sql:42941` (entrypoint, public.emit_event (installed, last definition)) — SECURITY DEFINER RPC, EXECUTE granted to authenticated (12309), reachable through PostgREST with the member's own JWT. The logged-in reserved-type refusals at 42958 and 42971 omit the three appointment lifecycle types. The caller needs only viewer (42993), and the row is inserted as pending with no actor (43034).
2. `lib/event-log/drain.ts:246` (propagation, drainEventLog) — With the service-role client, selects pending rows of every handled event type. There is no provenance filter.
3. `lib/event-log/register-handlers.ts:92` (propagation, ensureHandlersRegistered) — Registers the 0551 notice handler for appointment.created, appointment.rescheduled and appointment.cancelled on the shared dispatcher.
4. `lib/agenda/aviso-de-agendamento.handler.ts:62` (propagation, avisoDeAgendamentoNoWhatsAppHandler.handle) — Passes the row to aplicaAvisoDeAgendamento with the service-role db, the WhatsApp transport and the shared pacing ledger.
5. `lib/agenda/aviso-de-agendamento.ts:232` (propagation, aplicaAvisoDeAgendamento) — The appointment id comes from row.payload.appointment_id or entity_id, both chosen by the caller.
6. `lib/agenda/aviso-de-agendamento.ts:242` (propagation, aplicaAvisoDeAgendamento) — An appointment.cancelled row first cancels every pendente/para_o_resumo delivery of that appointment. This happens before any configuration or stored-state check, so a forged cancel suppresses real held notices.
7. `lib/agenda/aviso-de-agendamento.ts:264` (propagation, aplicaAvisoDeAgendamento) — Liveness is checked only for non-cancel events. Nothing checks that the announced transition happened or who emitted the row.
8. `lib/agenda/aviso-de-agendamento.ts:278` (propagation, aplicaAvisoDeAgendamento) — The delivery is claimed by event_log id (unique (organization_id, event_id)), so every forged row is a new notice.
9. `lib/agenda/aviso-de-agendamento.ts:330` (propagation, aplicaAvisoDeAgendamento) — The origin label comes from the caller-supplied payload.autor ('contact' is rendered as 'Cliente').
10. `lib/agenda/aviso-de-agendamento.ts:507` (sink, entrega_) — transporte.envia sends the WhatsApp message from the org's connection to the owner's phone. Line 531 then records it in the shared pacing_ledger.

### Evidence

- `supabase/baseline.sql:42958` — The reserved event types for logged-in callers do not include appointment.created, appointment.rescheduled or appointment.cancelled.
- `supabase/baseline.sql:42993` — emit_event requires only fn_role_at_least(v_org_id, 'viewer').
- `supabase/baseline.sql:12309` — EXECUTE on emit_event is granted to authenticated (anon is revoked).
- `supabase/baseline.sql:33197` — Real appointment writes (fn_appointment_change_core) require agent for logged-in callers, so a viewer cannot perform the transition it can announce.
- `app/api/v1/agenda/agendamentos/route.ts:159` — Viewers can list appointments, which gives them the appointment ids a forged event needs.
- `app/api/v1/agenda/agendamentos/_handler.ts:1161` — The legitimate emitter calls emit_event with the session client. That is why these types are not reserved, and it is the call to move to the server.
- `lib/agent-engine/pacing/ledger-supabase.ts:183` — The notice's daily cap is the lower of the warm-up step and channel_sessions.daily_message_limit, counted from pacing_ledger rows since local midnight.
- `lib/agent-engine/pacing/defaults.ts:79` — A number with no activation date (no channel_knobs row) gets a warm-up cap of 20 messages per day.
- `supabase/baseline.sql:1330` — channel_sessions.daily_message_limit defaults to 300 and is NOT NULL, so every number has a finite daily cap that forged notices can use up.
- `lib/agent-engine/guardrails/before-send.ts:1241` — The AI agent's pre-send guard reads the same pacing_ledger state per channel, so notices use up the cap that customer replies need.
- `lib/campanhas/rodada.ts:383` — Campaign rounds read the same pacing_ledger state.
- `app/api/v1/agenda/aviso/teste/route.ts:43` — Contrast: one deliberate test send needs admin (line 48) and a 3-per-hour bucket because it 'gasta uma mensagem do número do cliente'.
- `lib/agenda/aviso-de-agendamento.handler.ts:45` — The send is audited with bypassedRls and no actor, so the forging member is not attributed.

### Conditions

- **authentication_level**: An authenticated session of a member of the target organization, used directly against the Supabase PostgREST RPC endpoint with the anon key and the member's own JWT, as the browser client already does.
- **authorization_role**: viewer is enough. No agent, manager or admin role is needed.
- **system_configuration**: The organization has turned on the WhatsApp appointment notice (config_aviso_de_agendamento.ligado = true; off by default) with a WORKING connection that accepts free-form messages.
- **data_state**: The attacker knows an appointment id of the org (viewers can list them). created/rescheduled need a pending or confirmed appointment. cancelled works on any existing appointment of the org. A spoofed cancellation is sent when no notice for that appointment is held, or when one was already sent. When a notice is held and none was sent yet, the forged cancel silently suppresses it instead.
- **timing_dependency**: Individual notices go out from 07:00 to 22:00 org-local. Forged events at night are folded into the 07:00 summary (up to 30 lines). Rows older than 30 minutes are skipped, which does not affect freshly forged rows.

### Bounded local reproduction

**Principal:** A viewer of organization A, holding their own session JWT, calls the emit_event RPC through PostgREST for appointment lifecycle types on an appointment id they can list.

**Inputs:**

- POST /rest/v1/rpc/emit_event with Authorization: Bearer <viewer session JWT> and body {"p_event_type":"appointment.cancelled","p_entity_kind":"calendar_appointment","p_entity_id":"<appointment-id>","p_payload":{"appointment_id":"<appointment-id>","autor":"contact"},"p_metadata":{},"p_organization_id":"<org-id>"}
- `agents/verifier-agenda/artifacts/evidence/viewer-forges-appointment-events.sql`
- `agents/verifier-agenda/artifacts/evidence/notice-harness.txt`

**Instructions:**

1. In the approved sandbox (no network), start a throwaway Postgres 16 and run /opt/sbx-audit/pgbase (Supabase prelude plus supabase/baseline.sql with ON_ERROR_STOP). Then run psql -f viewer-forges-appointment-events.sql. It creates a dummy org, a viewer member and a confirmed appointment, runs three controls and the probe as role authenticated with request.jwt.claims.sub set to the viewer, and rolls back.
2. Observe that the controls are refused (fn_appointment_change cancel, reserved appointment.outcome_confirmed, the server-only service_boundary marker). Observe that emit_event accepts appointment.cancelled, appointment.created and appointment.rescheduled from the viewer as pending event_log rows while the appointment stays confirmed.
3. Save notice-harness.txt as notice-harness.ts and run it with tsx --tsconfig <repo>/tsconfig.json inside the sandbox. It feeds rows shaped like those to the real aplicaAvisoDeAgendamento with the real decidirEspacamento, dayStartInTz and PACING_DEFAULTS. It uses an in-memory delivery table and ledger that mirror createSupabaseAvisoDeAgendamentoDb (unique org+event_id; cancel = pendente/para_o_resumo of the same appointment except the current event) and a transport that records bodies instead of sending.
4. Observe (a) the spoofed cancellation sent for a confirmed appointment, (b) a real held notice cancelled by a forged cancel and never sent, and (c) the daily cap used up by forged created events.

**Observed result:**

These are the verifier's own reproduction files, not the hunter's artifacts. SQL (installed baseline, rolled back): is_viewer=t, is_agent=f. The viewer reads the confirmed appointment through RLS. Control 1 fn_appointment_change(cancel) was REFUSED 42501 appointment_forbidden. Control 2 emit_event(appointment.outcome_confirmed) was REFUSED 42501 reserved_message_received. Control 3 emit_event with metadata.service_boundary was REFUSED 42501 reserved_service_origin. emit_event accepted appointment.cancelled, appointment.created and appointment.rescheduled (accepted=t). It produced three status=pending rows with autor=contact and no server marker, and the appointment stayed confirmed. authenticated has EXECUTE on emit_event; anon does not. Harness: (a) the forged appointment.cancelled for the confirmed appointment returned {status: ok, detail: 'enviado canal=...'}. The body sent to the owner was 'Org V: agendamento cancelado / Cliente: Joana / Serviço: Limpeza / Quando: sex., 20/11, 10:00 / Origem: Cliente'. (b) A real appointment.created was deferred by spacing (retry pacing:espacamento, delivery left pendente). A forged appointment.cancelled then cancelled it, and the drain's retry of the real row returned skipped 'ja_resolvido:cancelado', so the real notice was never sent. (c) 25 forged appointment.created rows gave {ok:enviado: 19, retry:pacing:teto_diario: 6}, and pacing_ledger reached 20 rows (1 from step a plus 19). The next pacing decision for the number was {liberado: false, motivo: teto_diario, liberaEm: 2026-11-19T03:00:00.000Z}, which is local midnight.

### Remediation

Stop logged-in members from producing rows that the notice consumer treats as commands, and make the consumer check stored state before it acts. (1) Add appointment.created, appointment.rescheduled and appointment.cancelled to emit_event's logged-in reserved list. Do this in a new migration plus a baseline appendix block above the anon sweep, re-creating the full installed definition. (2) In fecharOLaco (app/api/v1/agenda/agendamentos/_handler.ts:1161), emit these events with the service-role client after the existing agent+ authorization and the successful write, with the organization taken from ctx. Confirm the MCP tool and chatbot callers of the same handler, and the Google sync emitter (lib/agenda/google/mudanca-vinda-do-google.ts), reach emit_event without a login. This also closes the same forging path into the automation-rules consumer, which matches these types (lib/schemas/webhooks.ts:55-58). (3) Defense in depth in aplicaAvisoDeAgendamento: for appointment.cancelled, require the stored appointment status to be 'cancelled' before cancelling held deliveries or sending (cancelled is terminal in fn_appointment_change_core). (4) Add regression tests. Invariant: a viewer or agent session calling emit_event('appointment.cancelled', ...) gets 42501. Unit: a cancel row for a confirmed appointment returns skipped, cancels no held delivery and never calls the transport.

`supabase/migrations/<next>_reservar_eventos_de_agendamento.sql`

```
-- Re-create public.emit_event from its installed definition (supabase/baseline.sql:42941),
-- changing only this list; mirror it in a baseline appendix block above the anon sweep.
if auth.uid() is not null and p_event_type in (
  'message.received','appointment.outcome_confirmed',
  'ai.case_opened','ai.case_closed',
  'appointment.created','appointment.rescheduled','appointment.cancelled'
) then
  raise exception 'reserved_message_received' using errcode='42501';
end if;
```

`app/api/v1/agenda/agendamentos/_handler.ts`

```
// fecharOLaco: the transition was already authorized (agent+) and written; emit as the server.
import { createAdminClient } from "@/lib/supabase/admin";
// ...
    const { error } = await createAdminClient().rpc("emit_event", {
      p_organization_id: ctx.organization_id, // from authz, never from the body
      p_event_type: args.gatilho,
      p_entity_kind: ENTIDADE_DO_AGENDAMENTO,
      p_entity_id: args.appointmentId,
      p_payload: payloadDoAviso({ /* unchanged */ }),
      p_metadata: { request_id: ctx.requestId },
    });
```

`lib/agenda/aviso-de-agendamento.ts`

```
  let canceladas = 0;
  if (evento === "appointment.cancelled") {
    // A cancel notice must reflect a real, stored cancellation (cancelled is terminal).
    const atual = await deps.db.carregaAgendamento(orgId, appointmentId);
    if (!atual || atual.status !== "cancelled") return skipped("cancelamento_nao_confere");
    canceladas = await deps.db.cancelaPendentesDoAgendamento(orgId, appointmentId, row.id);
  }
```

## [MEDIUM] Contacts import email check runs in quadratic time, so one crafted upload by any agent stalls the shared app process

- Fingerprint: `contacts-import-mapLinha-email-regex-quadratic`
- Likelihood: medium — Any member with the agent role in any organization on the install can trigger it with one small multipart upload. The route has no rate limit, and nothing below the 5 MiB application cap bounds the body. It still requires an authenticated agent.
- Impact: medium — The impact is on availability only. The single shared app process stops serving every organization's UI, API and incoming webhooks while the regex runs: about 1 s per 40 KB measured, and minutes to hours at MiB sizes extrapolated. The TCP healthcheck and restart policy do not recover it, while the separate worker container keeps running. A manual restart recovers it, and no data is affected.
- Confidence: high — Quadratic growth and event-loop blocking were measured on the route's own functions with controls, and the single-process, no-body-limit topology is the shipped Dockerfile, compose and Caddyfile. Only the multi-minute and multi-hour figures are extrapolated, and an external proxy in Traefik mode could shorten, but not remove, the stall.

### Description

POST /api/v1/contacts/import requires the agent role. It accepts a CSV or vCard of up to 5 MiB and passes each data row to mapLinha. mapLinha caps name and display_name at 200 characters, but it tests the full email cell against /^[^\s@]+@[^\s@]+\.[^\s@]+$/ before any length check or Zod schema. On the cell 'a@' followed by N dots and a final '@', V8's backtracking engine does O(N^2) work: every split point of the second [^\s@]+ re-scans the rest of the dots before $ fails. The call is synchronous, inside the request handler.

Measured locally on the route's own pure sequence (decodificarCsv, parseCsv, mapHeader, mapLinha):
- Timings were 5 ms at 2.5 KB, 20 ms at 5 KB, 60 ms at 10 KB, 251 ms at 20 KB and 1,051 ms at 40 KB, about 4x per doubling.
- A 10 ms timer queued in the same process fired only after the 40 KB call returned, 1,230 ms later.
- Extrapolated, not run: about 12 minutes for a 1 MiB cell and about 5 hours at the 5 MiB cap.
- The vCard path reaches the same regex with EMAIL capped at 20,000 characters per logical line, at about 0.3 s per card.

The shipped production topology is one app container running a single `node server.js` process, which serves every organization's UI, API and incoming webhooks. Nothing source-visible bounds the request below the app's 5 MiB cap: Caddy's reverse_proxy has no body limit, the route has no rate limit, and Next.js buffers proxy bodies up to 10 MiB. The healthcheck is a raw TCP connect, and restart: unless-stopped does not restart a blocked process, so recovery is a manual restart. The regex predates the diff (blame 823812681), but it is on the assigned import path.

### Root cause

mapLinha (lib/contacts/csv.ts:411-413) runs an ambiguous backtracking regex on an uncapped, user-supplied email cell. Validation is therefore quadratic in a cell length that only the 5 MiB file cap bounds, and it runs inside the synchronous request path of the single shared Node.js process.

### Intended behavior

Validating an accepted import cell is linear in its length, or the cell is length-capped (for example at 254 characters, the RFC 5321 limit) and rejected before any regex runs. Validating a 5 MiB file takes milliseconds, not minutes.

### Trace

1. `app/api/v1/contacts/import/route.ts:70` (entrypoint, POST /api/v1/contacts/import) — Any authenticated member with role agent or higher in any organization of the install can upload a file.
2. `app/api/v1/contacts/import/route.ts:116` (propagation, size check) — The only size bound is file.size > CSV_MAX_BYTES (5 MiB, lib/contacts/csv.ts:148). No per-cell bound exists.
3. `app/api/v1/contacts/import/route.ts:132` (propagation, parse) — parseCsv or vcfParaLinhas produce the rows in linear time. One data row fits within the 500-row cap.
4. `app/api/v1/contacts/import/route.ts:166` (propagation, per-row validation) — mapLinha runs synchronously for each row, before the Zod schema at line 179.
5. `lib/contacts/csv.ts:411` (propagation, mapLinha email) — email = get('email') is only trimmed. Unlike name and display_name (lines 407-409), it is not sliced.
6. `lib/contacts/csv.ts:413` (sink, email regex) — /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) backtracks in O(n^2) on 'a@' + '.'×n + '@' and blocks the event loop for the duration.

### Evidence

- `lib/contacts/csv.ts:148` — CSV_MAX_BYTES = 5 MiB is the only bound on the cell length.
- `lib/contacts/csv.ts:407` — name and display_name are sliced to 200 characters, but email is not.
- `lib/contacts/csv.ts:414` — The rejection reason echoes the whole email cell back into the response body.
- `lib/contacts/vcf.ts:46` — The vCard path caps a logical line at 20,000 characters. That bounds each EMAIL value at about 0.3 s, but a 5 MiB file holds about 250 such cards.
- `Dockerfile:146` — CMD ["node","server.js"]: one process and one event loop serve every route for every organization.
- `docker-compose.prod.yml:50` — The healthcheck is a raw TCP connect. The kernel accepts connections while the event loop is blocked, and restart: unless-stopped does not act on health, so nothing restarts the process.
- `Caddyfile:47` — The shipped reverse proxy forwards to app:3000 with no request_body max_size, so the 5 MiB application cap is the effective limit.

### Conditions

- **authentication_level**: An authenticated session of any member.
- **authorization_role**: Role agent or higher in any organization on the install. The import route requires agent.
- **system_configuration**: The shipped topology runs one app container with one node server.js process, behind the kit's Caddy, which has no body limit. An external proxy in Traefik mode with its own body limit would shrink the stall quadratically but not remove it: a 1 MiB cap still allows about 12 minutes (extrapolated).

### Bounded local reproduction

**Principal:** A member with the agent role in one organization, who uploads one crafted contacts CSV through the normal import route.

**Inputs:**

- `CSV text: 'nome,email\nDummy,a@' + '.'.repeat(k) + '@\n' for k in 2500, 5000, 10000, 20000, 40000`
- `Native-interface equivalent (not executed): POST /api/v1/contacts/import with an agent session cookie and multipart/form-data field file=contatos.csv (text/csv) containing that text. The 5 MiB cap admits k up to about 5,242,860.`

**Instructions:**

1. In the parent sandbox (no network, Node 22), run work/import-email-regex.ts with /home/claude/wt-seguranca/node_modules/.bin/tsx --tsconfig /home/claude/wt-seguranca/tsconfig.json. It imports the real decodificarCsv, parseCsv, mapHeader and mapLinha from lib/contacts/csv.ts and vcfParaLinhas from lib/contacts/vcf.ts. The source is in evidence/import-email-regex-harness.txt.
2. For each k, time the route's pure sequence on the attack cell. Then time two controls: cells of the same size without the ambiguous shape, and the attack cell sliced to 254 characters. Then time one vCard card with a 19,993-character EMAIL.
3. Run work/event-loop.ts. It queues a 10 ms timer, calls mapLinha once on the 40,000-dot cell, and prints when the timer actually fired. Stop at 40 KB; larger inputs are extrapolated, not run.

**Observed result:**

This is the verifier's own bounded reproduction (evidence/import-email-regex-growth.log), with one run per size.

The route's pure sequence took:
- 5.2 ms at 2,521 bytes
- 19.9 ms at 5,021 bytes
- 60.2 ms at 10,021 bytes
- 251.3 ms at 20,021 bytes
- 1,051.4 ms at 40,021 bytes

The ratios per doubling were 3.81, 3.03, 4.17 and 4.18, and every attack row was rejected with 'e-mail inválido'.

Controls: a 40,022-byte cell 'a'*k + '@b.c' took 1.0 ms, and the attack cell sliced to 254 characters tested in 0.00 ms. The vCard path took 313.9 ms for one card with a 19,993-character EMAIL. A 10 ms timer queued before one mapLinha call on the 40,000-dot cell fired after 1,230 ms, because the call ran synchronously for 1,228 ms.

The HTTP route, the full Next.js server and sizes above 40 KB were not run. The 12-minute (1 MiB) and 5-hour (5 MiB) figures are quadratic extrapolations.

### Remediation

Reject email cells longer than 254 characters before the regex, so the worst case stays trivially small, or replace the regex with a linear split on '@' and '.'. Truncate the echoed value in the rejection reason. Add a timing regression test that a 1 MB email cell is rejected in well under 50 ms on both the CSV and the vCard path.

`lib/contacts/csv.ts`

```
const EMAIL_MAX = 254; // RFC 5321 path limit

  const email = get("email");
  if (email !== "") {
    if (email.length > EMAIL_MAX || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { contato: {}, motivo: _t("e-mail inválido: ") + `"${email.slice(0, 80)}"` };
    }
    contato.email = email;
  }
```

`tests/unit/import-email-linear.test.ts`

```
it("rejects a 1 MB email cell quickly", () => {
  const rows = parseCsv(`nome,email\nDummy,a@${".".repeat(1_000_000)}@\n`);
  const { indices } = mapHeader(rows[0]!);
  const t0 = performance.now();
  expect(mapLinha(rows[1]!, indices).motivo).not.toBeNull();
  expect(performance.now() - t0).toBeLessThan(50);
});
```

## [MEDIUM] Invited participant gains owner-level control over another agent's private conversation (2-argument visibility rule ignores is_private)

- Fingerprint: `fn-can-view-conversation-2arg:participante-controla-conversa-privada`
- Likelihood: medium — Needs an agent who was invited to a private conversation in an org using visibility_mode 'all' (a first-class setting in Configurações › Atendimento), or invited by a manager to an unassigned private conversation in the default mode. Invites are the feature's normal workflow. Close, sector and chatbot are ordinary app routes, and the REST variant needs only the user's own token.
- Impact: medium — Inside one tenant, a lower-trust invited colleague gets owner/manager control over a private conversation. It can expose the whole private customer history to every other agent, lock the original owner out, close the conversation or reroute it with the bot silenced, and rewrite or delete the owner's sent messages. There is no cross-tenant effect, and inbound customer messages cannot be deleted.
- Confidence: high — Independently reproduced on the installed baseline.sql policies and functions with dummy tenants. The reproduction includes a before-invite baseline, the never-invited colleague, the message-history variant, the default-mode variant and an 'own'-mode control. The route hops are source-visible, and the gate RPC outcome was measured directly.

### Description

Migration 0544 lets the owner of a conversation, or a manager, invite a colleague to it. Its stated contract is that the invite widens read and reply only. In the code this reads 'Ler não é mandar', 'O convite permite responder, sem mudar o responsável ou encerrar o atendimento', and the dono único 'continua sendo quem FECHA e TRANSFERE'. That contract is enforced in two places, and both use the 2-argument fn_can_view_conversation(org, assigned_to_user_id). The first is the route gate exigirControleDaConversa, used by POST close, POST setor, POST chatbot and PATCH status. The second is the 0544 restrictive UPDATE/DELETE policies on conversations and messages. The 2-argument rule has no privacy term. In visibility_mode 'all' it is true for every agent. In the default 'own_and_unassigned' it is true for every agent when the conversation has no owner. Before the invite, an agent cannot touch another agent's private conversation, because conversations_select and fn_conversation_assign use the privacy-aware 3-argument rule and hide it. After the invite, the participant branch of conversations_select makes the row visible, and the 2-argument control check passes. On the installed baseline, in mode 'all', the invited agent can do the following to the owner's private conversation. (1) Pass the route gate, so it can close the conversation, start a chatbot, or move it to a sector. The sector route's service-role release then unassigns the original owner, who can no longer see the conversation, while the invitee keeps access. (2) Through the Supabase REST API with its own JWT: set is_private=false, which exposes the whole history to every agent who was never invited; assign the conversation to itself, which locks the owner out; set status='closed'; and rewrite or hard-delete the owner's outbound messages. The same holds in the default mode for an unassigned private conversation that a manager shared. Only the RPC path fn_conversation_assign refuses the invitee, because it uses the 3-argument rule.

### Root cause

The post-invite control predicate reuses fn_can_view_conversation(uuid, uuid) (baseline.sql 5305), which omits the is_private condition. The privacy-aware rule that governed the agent's authority before the invite is fn_can_view_conversation(uuid, uuid, boolean) (baseline.sql 42909), used by conversations_select (51238) and fn_conversation_assign (43091). The 0544 restrictive policies conversation_participant_read_is_not_control_update/delete (51259, 51264) and message_participant_reply_is_not_history_update/delete (51271, 51286), and lib/inbox/controle-da-conversa.ts:19, call the 2-argument overload. For private conversations the control predicate is therefore wider than the read predicate the invite was meant to extend, and the participant branch supplies the read access that used to block everything else.

### Intended behavior

An invited participant may read and reply only. Changing the owner, status, sector, privacy or chatbot state of a private conversation, and editing or deleting another person's messages in it, stays limited to its assigned agent, managers/admins and the platform admin. This is the rule fn_conversation_assign already applies through fn_can_view_conversation(org, assigned_to_user_id, is_private), and the one the 0544 comments and the gate's error message promise.

### Trace

1. `app/api/v1/conversations/[id]/setor/route.ts:37` (entrypoint, POST /api/v1/conversations/[id]/setor) — The caller is an agent+ cookie user (requireRole('agent'), line 40). The route reads the conversation with the session client (lines 57-64). Under RLS the private conversation is returned to an invited participant.
2. `supabase/baseline.sql:51236` (propagation, policy conversations_select (installed 0544 definition)) — Besides the 3-argument privacy rule, the policy has an 'or exists (conversation_participants ... user_id = auth.uid() and left_at is null)' branch that makes another agent's private conversation readable by the invitee.
3. `lib/inbox/controle-da-conversa.ts:19` (propagation, exigirControleDaConversa) — Calls rpc fn_can_view_conversation with only p_org and p_assigned_to_user_id, which resolves to the 2-argument overload. is_private is never passed.
4. `supabase/baseline.sql:5305` (propagation, fn_can_view_conversation(uuid, uuid)) — Returns true for any agent when visibility_mode='all', and for an unassigned conversation in 'own_and_unassigned'. It has no is_private term, so the gate passes for the invitee.
5. `lib/setores/servico.ts:182` (propagation, transferirParaSetor) — A service-role UPDATE moves the conversation to the sector the caller chose, silences the bot (bot_silenced_until='infinity') and clears active_ai_agent_id.
6. `lib/setores/servico.ts:201` (sink, transferirParaSetor release) — Service-role fn_conversation_assign(to=null, 'release') runs when the owner is not in the sector. With auth.uid() null, its 3-argument visibility check (baseline.sql 43090-43093) is skipped. The original owner is unassigned and loses sight of the private conversation, while the invitee keeps it.

### Evidence

- `lib/inbox/controle-da-conversa.ts:9` — The comment claims the gate reuses the pre-invite rule that protects fn_conversation_assign, but that function uses the 3-argument, privacy-aware form.
- `supabase/baseline.sql:51256` — 0544 contract: 'Ler não é mandar: o convite (e o setor) não ampliam UPDATE/DELETE da conversa. Quem já escrevia continua escrevendo.'
- `supabase/baseline.sql:51259` — Restrictive UPDATE policy conversation_participant_read_is_not_control_update uses the 2-argument rule. The verifier probe confirms that pg_get_expr of the installed policy is fn_can_view_conversation(organization_id, assigned_to_user_id).
- `supabase/baseline.sql:51271` — Restrictive message UPDATE policy uses the 2-argument rule, and so does the DELETE policy at 51286. In mode 'all' the invitee passes both for the owner's outbound messages. Verifier probe V2e: UPDATE body = 1 row, DELETE = 1 row.
- `supabase/baseline.sql:42909` — The 3-argument overload adds 'not is_private or platform admin or assignee or manager/admin'. Probe V1: it returns false for the invitee, while the 2-argument gate returns true.
- `supabase/baseline.sql:43091` — fn_conversation_assign authorizes a logged-in caller with the 3-argument rule. Probe V2d: the invitee's RPC claim returns 0 rows. This is the only control path that is correctly bound.
- `supabase/baseline.sql:5347` — The permissive policy conversations_agent_update allows any agent+ of the org to update any visible row. The table has GRANT ALL to authenticated (line 4585), and fn_conversa_colunas_do_atendimento (43428) does not protect is_private, assigned_to_user_id or status. So the restrictive 0544 policy is the only row-level guard on those columns.
- `app/api/v1/conversations/[id]/privacy/route.ts:76` — The privacy route itself allows only a manager or the assignee. The direct REST UPDATE of is_private under the 2-argument restrictive policy bypasses this rule.
- `app/api/v1/conversations/[id]/close/route.ts:85` — The close route relies on exigirControleDaConversa, then closes through the service-role fn_service_status at line 191.
- `app/api/v1/conversations/[id]/chatbot/route.ts:72` — Manual chatbot start relies on the same 2-argument gate.
- `app/api/v1/conversations/_handler.ts:540` — PATCH /conversations/[id] status changes rely on the same gate before the service-role fn_service_status (line 577).
- `tests/invariants/participante-nao-herda-controle-da-conversa.test.ts:102` — The shipped invariant seeds only visibility_mode 'own' (lines 102 and 104), the one mode where the 2- and 3-argument rules agree, so the disagreement is untested.

### Conditions

- **authentication_level**: Authenticated session of an organization member.
- **authorization_role**: Tenant role 'agent', invited as an active participant to the target conversation by its owner or by a manager.
- **system_configuration**: organizations.settings.visibility_mode = 'all' (any private conversation), or the default 'own_and_unassigned' when the private conversation currently has no owner.
- **data_state**: The target conversation has is_private = true and is assigned to another agent (or is unassigned, in the default mode).
- **network_routing**: The route variants (close, setor, chatbot, PATCH status) need only the app. The direct-UPDATE variants (is_private, assigned_to_user_id, status, message edit/delete) also need the Supabase REST endpoint, which the app's browser client already uses, called with the user's own JWT.

### Bounded local reproduction

**Principal:** An agent in an organization using visibility_mode 'all', invited to help on a colleague's private conversation. It acts through the ordinary app routes with its session cookie, or through the Supabase REST API with its own access token.

**Inputs:**

- `POST /api/v1/conversations/<private conversation id>/setor {"setor_id":"<sector uuid>"} with the invitee's session cookie`
- `POST /api/v1/conversations/<private conversation id>/close {} with the invitee's session cookie`
- `PATCH /rest/v1/conversations?id=eq.<private conversation id> {"is_private":false} with the invitee's JWT (SQL equivalent: update public.conversations set is_private = false where id = '<conversation>')`
- `update public.conversations set assigned_to_user_id = '<invitee>' where id = '<conversation>'`
- `update public.messages set body = 'rewritten by guest' where id = '<owner outbound message>'; delete from public.messages where id = '<owner outbound message>'`
- `set local role service_role; select count(*) from public.fn_conversation_assign('<org>','<conversation>',null,'release',null,false)`
- `agents/verifier-conversa/artifacts/evidence/convidado-controle.sql`

**Instructions:**

1. Verifier's own bounded reproduction, not the hunter's artifact. Inside sb verifier-conversa --pg (no network, read-only repository, scratch-only writes), run /opt/sbx-audit/pgbase, which applies the Supabase prelude and supabase/baseline.sql with ON_ERROR_STOP=1. Then run psql -v ON_ERROR_STOP=1 -f evidence/convidado-controle.sql.
2. Seed one dummy org with settings {"visibility_mode":"all"}: agents OWN, GST and OTH, manager MGR, a channel session, a contact, and a private conversation claimed by OWN, with one inbound message and one outbound 'user' message sent by OWN.
3. V0: as GST before any invite, count visible rows and try UPDATE is_private and UPDATE of OWN's message.
4. Insert the conversation_participants row server-side, as the participants route does. V1: as GST, evaluate the 2-argument gate and the 3-argument rule.
5. V2a-V2e: as GST, each in a rolled-back transaction, try direct UPDATEs of is_private (then check visibility for OTH), assigned_to_user_id (then check visibility for OWN) and status; try the fn_conversation_assign claim RPC; and try UPDATE and DELETE of OWN's outbound message and DELETE of the inbound message.
6. V3: call fn_conversation_assign(release) as service_role with no JWT claims, as the setor route does, then check visibility for OWN and GST.
7. Control C: switch the org to 'own' and repeat the gate and UPDATE probes. Case D: switch to 'own_and_unassigned', unassign the private conversation, and repeat the gate and the is_private UPDATE.

**Observed result:**

From agents/verifier-conversa/artifacts/evidence/convidado-controle.log, exit=0. The installed 2-argument definition has no is_private term, and the installed restrictive UPDATE policy is fn_can_view_conversation(organization_id, assigned_to_user_id). V0, before the invite: GST sees 0 rows; UPDATE is_private affects 0 rows; UPDATE of OWN's message affects 0 rows. V1, after the invite: GST sees 1 row; 2-argument gate = true; 3-argument rule = false. V2a: UPDATE is_private=false affects 1 row; never-invited OTH goes from 0 to 1 conversation and from 0 to 2 messages visible. V2b: UPDATE assigned_to_user_id=GST affects 1 row; OWN then sees 0. V2c: UPDATE status='closed' affects 1 row. V2d: the fn_conversation_assign claim by GST returns 0 rows. V2e: UPDATE of OWN's outbound message body affects 1 row; DELETE of it affects 1 row; DELETE of the inbound message affects 0 rows. V3: the service-role release affects 1 row; OWN sees 0 and GST sees 1. Control in 'own': GST still sees the conversation, but the gate = false and both UPDATEs affect 0 rows. Default mode, unassigned private conversation: OTH sees 0, GST sees 1, 2-argument gate = true, 3-argument rule = null (not true), UPDATE is_private=false affects 1 row. The route hops (close, setor, chatbot, PATCH status) were traced in source, not driven over HTTP.

### Remediation

Make the post-invite control predicate the privacy-aware rule. In a forward-fix migration, plus a baseline appendix block and a MANIFEST line, recreate the 0544 restrictive UPDATE/DELETE policies on conversations and messages with fn_can_view_conversation(organization_id, assigned_to_user_id, is_private). Pass p_is_private in exigirControleDaConversa, and load is_private in the callers that do not already select it (close, setor and chatbot; the PATCH handler's SELECT_COLS already includes it). Add an invariant case in visibility_mode 'all' (and in 'own_and_unassigned' with an unassigned private conversation): the invitee's gate is false, its UPDATE of is_private, assigned_to_user_id and status affects 0 rows, and its UPDATE/DELETE of the owner's message affects 0 rows.

`lib/inbox/controle-da-conversa.ts`

```
export async function exigirControleDaConversa(
  supabase: SupabaseClient,
  ctx: HandlerCtx,
  conversa: { assigned_to_user_id: string | null; is_private: boolean | null },
): Promise<void> {
  if (ctx.actor.type !== "user" || conversa.assigned_to_user_id === ctx.actor.id) return;
  const { data, error } = await supabase.rpc("fn_can_view_conversation", {
    p_org: ctx.organization_id,
    p_assigned_to_user_id: conversa.assigned_to_user_id,
    p_is_private: conversa.is_private ?? true, // fail closed if a caller did not load the flag
  });
  if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
  if (data !== true) throw new ApiError(403, "forbidden", undefined, ctx.requestId,
    traduzir("O convite permite responder, sem mudar o responsável ou encerrar o atendimento.", ctx.idioma ?? "pt-BR"));
}
// callers: select "id, assigned_to_user_id, is_private" before the gate in close, setor and chatbot routes.
```

`supabase/migrations/<next>_controle_da_conversa_respeita_privada.sql`

```
drop policy if exists conversation_participant_read_is_not_control_update on public.conversations;
create policy conversation_participant_read_is_not_control_update on public.conversations
  as restrictive for update to authenticated
  using (public.fn_can_view_conversation(organization_id, assigned_to_user_id, is_private)) with check (true);
drop policy if exists conversation_participant_read_is_not_control_delete on public.conversations;
create policy conversation_participant_read_is_not_control_delete on public.conversations
  as restrictive for delete to authenticated
  using (public.fn_can_view_conversation(organization_id, assigned_to_user_id, is_private));
drop policy if exists message_participant_reply_is_not_history_update on public.messages;
create policy message_participant_reply_is_not_history_update on public.messages
  as restrictive for update to authenticated
  using ((sent_by_user_id = auth.uid() and direction = 'outbound' and sent_via in ('user','crm'))
    or exists (select 1 from public.conversations c where c.id = messages.conversation_id
      and c.organization_id = messages.organization_id
      and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id, c.is_private)))
  with check (exists (select 1 from public.conversations c where c.id = messages.conversation_id
      and c.organization_id = messages.organization_id
      and (public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id, c.is_private)
        or (messages.sent_by_user_id = auth.uid() and messages.direction = 'outbound' and messages.sent_via in ('user','crm')))));
drop policy if exists message_participant_reply_is_not_history_delete on public.messages;
create policy message_participant_reply_is_not_history_delete on public.messages
  as restrictive for delete to authenticated
  using (exists (select 1 from public.conversations c where c.id = messages.conversation_id
    and c.organization_id = messages.organization_id
    and public.fn_can_view_conversation(c.organization_id, c.assigned_to_user_id, c.is_private)));
-- same block appended to supabase/baseline.sql after the 0544 block, plus a MANIFEST line
```

## [MEDIUM] Host update agent installs whatever git ref the app database names and auto-forces downgrades

- Fingerprint: `hostgator-setup-kit/agent.sh:to_version-from-app-selects-host-update-target-with-auto-force`
- Likelihood: low — Requires prior compromise of an app-tier credential (the service-role key or the app process), or INTERNAL_SECRET plus an owner click within the poisoning window. Tenant users and anonymous callers cannot reach it.
- Impact: high — Crosses the app→host boundary that the design explicitly protects. Without any interaction, the host cron user installs an attacker-chosen repository commit (old release, unreleased tag, intermediate SHA or unreleased main tip) with an automatic forced downgrade. It sources that commit's kit scripts, re-applies its baseline.sql to the production database (replacing newer security-definer and RLS-related function bodies), and runs or builds its images. That silently reverts security fixes across code, kit and DB for every tenant. The attacker is limited to commits already in the clone and cannot inject new code.
- Confidence: high — Every trace line was re-read in source. The real agent.sh, update.sh and _common.sh lines were executed by the verifier against a fixture repository, and the real agent and update routes were driven over a shared store. The handoff from an app-writable value to the host checkout is complete, and upstream v1.116.0 contains exactly the host-side guards that are missing here.

### Description

Since O9 (commit b2c8ed582, a port of upstream #2756/#2757), the heartbeat response from /api/v1/system/agent carries to_version verbatim from the newest dispatched system_update_runs row. agent.sh takes it as ALVO, falls back to its own LATEST_TAG only when it is empty, and appends --force itself whenever ALVO is an ancestor of HEAD. update.sh validates --to only with git rev-parse --verify <ref>^{commit}. With --to present it never consults the published-release authority ultima_release_estavel, and with --force it skips the downgrade guard. It then checks out the ref. It re-sources _common.sh and manutencao.sh from that commit as the host cron user. It re-applies that commit's supabase/baseline.sql to the production database and pins all images to :<ref>; if the pull or up fails, it builds and runs images from the checked-out tree. Accepted targets include any old release tag, tags with no published release, any historical commit SHA, relative refs such as v1.1.0~1, and remote-tracking refs such as origin/main (an unreleased tip newer than the installed release, which is not even forced). Before this diff the agent only ever passed its own LATEST_TAG. The design spec (line 36), the agent route header (lines 6-7) and agent.sh's own header (line 4) all state that even a compromised app chooses only WHEN the signed tag's update.sh runs, never WHAT runs. Now anything that can write a dispatched run row (the service-role key in the app/worker/voice-agent .env) or answer the heartbeat chooses the version the host installs, including forced downgrades that revert code, kit and DB-function security fixes. With only INTERNAL_SECRET (held by the scheduler and the app), an attacker can rewrite system_version.latest_version through a heartbeat or plant a failed run's from_version through a rollback message. The owner's next update, rollback or force click then dispatches the chosen ref. On the route side, ehVersaoPublicada (/^\d+\.\d+\.\d+/) is not end-anchored. Calibration against the comparable baseline: upstream v1.116.0 (tag present in this clone) end-anchors ehVersaoPublicada and makes agent.sh refuse any ALVO not matching ^v?\d+\.\d+\.\d+$, allowing a rollback only to the host-recorded origin (.update-de-onde-vim). Its stated reason is that whoever can write the host-app channel must not be able to reinstall an arbitrary old version with its baseline and functions. The fork's port lacks both guards.

### Root cause

hostgator-setup-kit/agent.sh:437-451 trusts the app-supplied to_version as the update target and adds --force itself for any ancestor ref. hostgator-setup-kit/update.sh treats --to as operator-authorized: it consults ultima_release_estavel only when --to is absent (line 107), validates the ref only by git rev-parse (lines 109-110), and runs the downgrade guard only without FORCE (line 176). Neither side binds the target to the host's published release or to a version this host recorded before its last update. The app-side filter lib/system/update-run.ts:283 is not end-anchored, and the update route uses system_version.latest_version (writable by any INTERNAL_SECRET heartbeat) as the plain-update target with no format or ordering check (update/route.ts:237).

### Intended behavior

Only an intent (update, rollback or force) should cross from the app to the host, as the design requires. The host should derive or verify the target from host-trusted sources. For update, that is its own ultima_release_estavel result. For rollback/force, it is the version update.sh recorded on disk before its last forward checkout. Any other ref, including non-vX.Y.Z strings, unreleased tags, SHAs, relative refs and remote-tracking refs, should be refused with a failed run_result and no update.sh call, and --force should be added only for the host-recorded previous release.

### Trace

1. `app/api/v1/system/agent/route.ts:151` (entrypoint, POST) — Agent heartbeat (Bearer INTERNAL_CRON_SECRET/INTERNAL_SECRET) that asks whether an order is pending. Its response is the host's only input.
2. `app/api/v1/system/agent/route.ts:207` (propagation, POST heartbeat) — Selects the newest dispatched system_update_runs row. Any service-role holder can write that table, and the update route inserts it with the service role from app-DB values.
3. `app/api/v1/system/agent/route.ts:227` (propagation, POST heartbeat) — Returns to_version verbatim to the host.
4. `hostgator-setup-kit/agent.sh:437` (propagation, agent.sh main) — ALVO = json_field(RESP, to_version). The host's own LATEST_TAG is used only when this is empty.
5. `hostgator-setup-kit/agent.sh:451` (propagation, agent.sh main) — Adds --force automatically when ALVO is an ancestor of HEAD (a downgrade).
6. `hostgator-setup-kit/agent.sh:463` (propagation, agent.sh main) — bash update.sh --to "$ALVO" [--force], run by the host cron (the installer's user; root in the standard install).
7. `hostgator-setup-kit/update.sh:109` (propagation, update.sh) — The only check is git rev-parse --verify <ref>^{commit}. Line 107 consults ultima_release_estavel only when --to is absent.
8. `hostgator-setup-kit/update.sh:176` (propagation, update.sh) — The downgrade/ancestry guard runs only when FORCE is empty, so it is skipped for the agent's auto-forced target.
9. `hostgator-setup-kit/update.sh:268` (propagation, update.sh) — git checkout of the app-selected ref.
10. `hostgator-setup-kit/update.sh:286` (sink, update.sh) — Re-sources _common.sh (and manutencao.sh, line 293) from the checked-out commit as the host user. The script then re-applies that commit's baseline.sql (392), pins images to :<ref> (645-649) and builds and runs them locally if up fails (728-729).

### Evidence

- `app/api/v1/system/agent/route.ts:6` — Route header: only a boolean crosses the boundary, and even with the app compromised the attacker does not choose what runs on the host. The to_version field contradicts this.
- `hostgator-setup-kit/agent.sh:4` — Agent header: it receives a boolean, not commands, and runs the published tag's update.sh.
- `docs/superpowers/specs/2026-07-28-atualizar-versao-na-ui-design.md:36` — Design invariant: with the app compromised, the attacker chooses only WHEN the signed tag's update.sh runs, never WHAT runs.
- `hostgator-setup-kit/_common.sh:2182` — The kit's release authority: an existing tag is not a published release, and installing an unreleased tag was treated as a defect. --to bypasses this check.
- `hostgator-setup-kit/agent.sh:160` — The agent fetches all tags (and the default refspec) from origin every 5 minutes, so every historical release tag and origin/main are resolvable in the host clone.
- `lib/system/update-run.ts:283` — ehVersaoPublicada uses /^\d+\.\d+\.\d+/ with no end anchor, so 1.0.0~1, 1.0.0-anything, v1.0.0^ and 1.0.0..HEAD pass as published (upstream v1.116.0 anchors it with $).
- `app/api/v1/system/agent/route.ts:259` — An INTERNAL_SECRET holder can insert a failed run whose from_version (returned_to) becomes the rollback/force target the update route derives.
- `app/api/v1/system/version/route.ts:186` — update_available is latest !== running with no ordering check, so a poisoned latest_version such as v1.0.0 is offered to the owner as a new version to click.
- `hostgator-setup-kit/update.sh:392` — The checked-out commit's baseline.sql is re-applied to the production database, replacing newer function bodies with that commit's definitions.
- `hostgator-setup-kit/update.sh:729` — When up fails for the :<ref> images, construir_aqui_e_subir builds and runs images from the checked-out tree.
- `docker-compose.prod.yml:242` — The scheduler container receives INTERNAL_SECRET. app, worker and voice-agent load the full .env with SUPABASE_SERVICE_ROLE_KEY (env_file at lines 38, 114, 409).

### Conditions

- **authorization_role**: Write access to public.system_update_runs through the service-role key present in the app, worker and voice-agent .env, or control of the app's /api/v1/system/agent response. Alternatively INTERNAL_SECRET (scheduler/app) plus a later owner click on update, rollback or force.
- **data_state**: The chosen ref must resolve in the host clone. That covers all tags and origin/* (fetched every 5 minutes), plus the full main history once is_already_in_head unshallows it. No fresh dispatched run may be in progress.
- **system_configuration**: The host update agent cron is installed and runs as the installer's user (root in the standard install). A dispatched target is executed within 5 minutes with no user interaction.
- **user_interaction**: Only on the INTERNAL_SECRET-only path: the platform owner must click Atualizar, Voltar or Forçar after latest_version or from_version has been poisoned.
- **timing_dependency**: On the INTERNAL_SECRET heartbeat path, the genuine agent rewrites latest_version every 5 minutes, so the poisoned value must be present when the owner clicks. The dispatched run's to_version then persists regardless.

### Bounded local reproduction

**Principal:** Holder of an app-tier credential that can write a dispatched system_update_runs row or control the heartbeat response, with no host access. Alternatively, a holder of INTERNAL_SECRET who poisons latest_version or from_version and waits for the owner's click.

**Inputs:**

- `{"data":{"update_requested":true,"run_id":"11111111-1111-4111-8111-111111111111","to_version":"v1.0.0"}}`
- `to_version = <40-hex SHA of an unreleased intermediate commit>`
- `to_version = "v1.20.0-manual" (tag with no published release)`
- `to_version = "v1.1.0~1"`
- `to_version = "origin/main" (unreleased tip newer than the installed release)`
- `system_update_runs row {status:'dispatched', to_version:'v1.0.0~1'} fed to the real agent route heartbeat`
- `INTERNAL_SECRET heartbeat {kind:'heartbeat', latest_version:'v1.0.0', ...} followed by owner POST /api/v1/system/update {}`
- `INTERNAL_SECRET {kind:'rollback', returned_to:'1.0.0~1', failed_version:'1.1.0', ok:false} followed by owner POST /api/v1/system/update {rollback:true}`

**Instructions:**

1. Verifier's own reproduction (not the hunter's harness), inside the parent sandbox with no network: harness/agent-alvo-verif.sh, copied to evidence/agent-alvo-verif-harness.txt. It builds a throwaway origin in scratch with tag v1.0.0, then an unreleased commit, then tag v1.20.0-manual, then tag v1.1.0 (the installed and published release), then an unreleased main tip. It clones that origin as the host checkout at v1.1.0.
2. Extract the REAL lines at run time with sed and evaluate them: agent.sh json_field (121-123), 203-208 and 437-451; _common.sh is_already_in_head (1137-1148). Feed them a heartbeat response carrying each to_version. Pass the resulting UPDATE_ARGS to the real update.sh lines 24-32, 107-111, 134-165, 176-207, 268-271 and 645-649, with ultima_release_estavel stubbed to answer v1.1.0 and record whether it was called, plus no-op docker/maintenance stubs. Include a control with empty to_version.
3. Separately, with vitest (evidence/system-update-verif-harness.txt), drive the real /api/v1/system/agent and /api/v1/system/update routes over one shared in-memory service-role store. First, a service-role-written dispatched row with to_version 'v1.0.0~1' is sent to a heartbeat. Second, an INTERNAL_SECRET heartbeat with latest_version 'v1.0.0' is followed by an owner {} click and the next genuine heartbeat. Third, an INTERNAL_SECRET rollback message with returned_to '1.0.0~1' is followed by an owner {rollback:true} click. Finally, run ehVersaoPublicada on non-release strings.

**Observed result:**

Verifier's bounded reproduction (evidence/agent-alvo-verif.log, evidence/system-update-verif.log). Control (empty to_version): update.sh was called with no --to, the release authority was consulted (yes) and returned v1.1.0, and update.sh reported that it is already the latest version. For every app-supplied target, the authority was consulted 'no' and line 109 accepted the ref. For v1.0.0, the unreleased SHA, v1.20.0-manual and v1.1.0~1, the agent produced 'update.sh --to <ref> --force', FORCE='1' skipped the downgrade guard, and the line-268 checkout succeeded. The on-disk kit that line 286 would source became that commit's ('kit of release v1.0.0 (old)', 'kit of UNRELEASED intermediate commit', 'kit of manual tag v1.20.0-manual (no release)'), as did the baseline for line 392. Image pins became :1.0.0, :<sha>, :1.20.0-manual and :1.1.0~1. origin/main produced 'update.sh --to origin/main' with no --force, passed the ancestry guard as a forward move, and checked out the unreleased main tip, pinning :origin/main. App side: the real agent route answered a service-role-written row with {update_requested:true, to_version:'v1.0.0~1'}. An INTERNAL_SECRET heartbeat set latest_version 'v1.0.0'. The owner's {} click then dispatched to_version 'v1.0.0', and the next genuine heartbeat (latest_version 'v1.1.0') still returned to_version 'v1.0.0'. An INTERNAL_SECRET rollback message planted a failed run with from_version '1.0.0~1', and the owner's {rollback:true} dispatched to_version 'v1.0.0~1'. ehVersaoPublicada returned true for '1.0.0~1', '1.0.0-anything', 'v1.0.0^' and '1.0.0..HEAD', and false for 'deadbeef'.

### Remediation

Restore the intent-only boundary, as upstream v1.116.0 already does. In agent.sh, refuse any ALVO that is not ^v?[0-9]+\.[0-9]+\.[0-9]+$, and report a failed run_result without calling update.sh. A forward target must equal the host's own ultima_release_estavel result, captured before LATEST_TAG is zeroed. A backward target, the only case that gets --force, must equal the version update.sh recorded on disk before its last forward checkout. In update.sh, write that origin file before the checkout. Anchor ehVersaoPublicada with $, and have the update route validate latest_version with it before dispatch. Consider giving the host agent a secret separate from the scheduler's INTERNAL_SECRET. Regression tests: a heartbeat whose to_version is an old tag that is not the recorded origin, a SHA, a ~N ref, an unreleased tag or origin/main must not produce an update.sh invocation.

`hostgator-setup-kit/agent.sh`

```
# line 169: keep the host's own published release before it is zeroed below
LATEST_TAG="$(ultima_release_estavel)" || true
RELEASE_PUBLICADA="$LATEST_TAG"
# ... lines 437-451 become:
ALVO="$(json_field "$RESP" to_version)" || ALVO=""
[ -n "$ALVO" ] || ALVO="$LATEST_TAG"
recusar_alvo() { log_err "pedido recusado: $1"; post "{\"kind\":\"run_result\",\"run_id\":\"${RUN_ID}\",\"status\":\"failed\",\"log_tail\":\"Alvo recusado pelo host. Nenhuma atualização foi executada.\"}" >/dev/null || true; exit 0; }
if [ -n "$ALVO" ] && ! [[ "$ALVO" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]]; then recusar_alvo "alvo não é uma versão publicada"; fi
UPDATE_ARGS=()
[ -n "$ALVO" ] && UPDATE_ARGS=(--to "$ALVO")
VOLTA_NO_TEMPO=""
if [ -n "$ALVO" ] && [ "$ALVO" != "$CURRENT_TAG" ]; then
  is_already_in_head "$ALVO" && CONTIDA=0 || CONTIDA=$?
  [ "$CONTIDA" = 0 ] && VOLTA_NO_TEMPO=1
fi
if [ -n "$VOLTA_NO_TEMPO" ]; then
  ORIGEM="$(head -n1 "${PROJECT_DIR}/.update-de-onde-vim" 2>/dev/null || true)"
  [[ "$ORIGEM" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+$ ]] && [ "${ALVO#v}" = "${ORIGEM#v}" ] || recusar_alvo "${ALVO} não é a versão de onde esta instalação veio"
  UPDATE_ARGS+=(--force)
elif [ -n "$ALVO" ] && [ "$ALVO" != "$CURRENT_TAG" ] && [ "${ALVO#v}" != "${RELEASE_PUBLICADA#v}" ]; then
  recusar_alvo "${ALVO} não é a release publicada"
fi
```

`hostgator-setup-kit/update.sh`

```
# immediately before line 268 (git checkout): remember where a FORWARD update came from
if [ -z "$VOLTA_NO_TEMPO" ] && [[ "$CURRENT_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  printf '%s\n' "$CURRENT_TAG" > "$PROJECT_DIR/.update-de-onde-vim"
fi
```

`lib/system/update-run.ts`

```
export function ehVersaoPublicada(versao: string | null | undefined): boolean {
  return /^\d+\.\d+\.\d+$/.test(semPrefixoV(versao ?? ""));
}
```

## [MEDIUM] Prospecting XLSX reader parses unterminated XML tags in quadratic time: a 1.3 KB upload blocks the shared app event loop for 12.7 s, and the stall grows quadratically

- Fingerprint: `planilha-xlsx-unterminated-tag-regex:lib/planilha/ler-arquivo.ts:parseXlsx`
- Likelihood: low — Needs the admin role in some organization and the off-by-default disparo_em_massa module enabled. Cross-tenant effect needs a multi-organization installation.
- Impact: medium — A request of about 1 KB blocked the event loop for 12.7 s (measured), and the duration grows quadratically at the attacker's choice. During the stall the single shared process serves no UI, API, webhook or cron request for any organization, and neither the TCP healthcheck nor the restart policy ends it. Stalls of minutes to hours are extrapolated, not run. No data is exposed.
- Confidence: high — Superlinear growth was measured directly on the real target function with tiny inputs in an independent reproduction, for two of the regexes. The same pattern is documented and already fixed elsewhere in the repository.

### Description

After decompression, parseXlsx extracts shared strings, rows, cells and text runs with lazy regexes of the form open-tag, lazy any-char, close-tag. When an opening tag has no matching close, V8's backtracking engine scans to the end of the string, fails, and retries at the next opening tag, so the cost is O(n^2) in the XML size. Neither the 40 MiB per-entry cap nor the 2 MB upload cap bounds this: a repeated '<si>' compresses to a few hundred bytes per 100 KB, and 40 MiB holds about 10.5 million such tags. parseImportFile runs synchronously, with no await inside parseXlsx, in the route handler of the single Next.js process, which serves the UI, API, WhatsApp webhooks and cron calls of every organization. The compose healthcheck is a raw TCP connect (docker-compose.prod.yml:50) that the kernel completes while the event loop is blocked, and Docker does not restart a merely unhealthy container, so nothing ends the stall early. The same regex class was already rewritten as forward scans for prospect HTML (lib/prospecting/leitura-do-html.ts:5-11) but not here; the sibling lib/crm-b2b/spreadsheet.ts shares the pattern.

### Root cause

lib/planilha/ler-arquivo.ts:174 (sharedStrings <si>), 180 (<row>), 186 (<c>) and 111 (<t>) call matchAll with a lazy any-char scan to a closing tag, and line 125 (<v>) uses the same shape with exec. Every unterminated opening tag costs a scan to the end of the string. No size or time limit applies at this stage beyond the 40 MiB per-entry inflate cap.

### Intended behavior

Parsing a spreadsheet the server already accepted should cost time linear in its size, as in the forward-scanning rewrite in leitura-do-html.ts. Malformed XML should end the scan as soon as no further closing tag exists.

### Trace

1. `app/api/v1/prospecting/importar/route.ts:35` (entrypoint, POST) — Session-only multipart upload of a .xlsx of at most 2 MB. Requires the admin role (line 45) and the disparo_em_massa module (line 40).
2. `app/api/v1/prospecting/importar/route.ts:102` (propagation, POST) — parseImportFile runs on the request's event loop; its body is synchronous, so the await does not yield during the parse.
3. `lib/planilha/ler-arquivo.ts:140` (propagation, parseXlsx) — xl/sharedStrings.xml and the sheet XML (each up to 40 MiB declared) are inflated from a few hundred bytes.
4. `lib/planilha/ler-arquivo.ts:174` (sink, parseXlsx) — The lazy shared-string regex matchAll over unterminated <si> tags costs quadratic time. The row regex at line 180 (measured), and the cell, text and value regexes at lines 186, 111 and 125, have the same shape.

### Evidence

- `lib/planilha/ler-arquivo.ts:174` — matchAll(/<si>([\s\S]*?)<\/si>/g) runs over the whole sharedStrings text.
- `lib/planilha/ler-arquivo.ts:180` — The row regex /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g has the same lazy any-char-to-close-tag shape over the sheet XML.
- `lib/prospecting/leitura-do-html.ts:8` — The repository documents and fixes this exact class for HTML ('abertura sem fechamento ... segundos, ou minutos, para 200 KB') but not for XLSX.
- `docker-compose.prod.yml:50` — The healthcheck is a raw TCP connect from a separate node process, which succeeds while the server's event loop is blocked.
- `lib/crm-b2b/spreadsheet.ts:190` — The sibling reader (manager role via app/api/v1/imports/route.ts:63) has the same <si>, <row> and <c> regexes at lines 190, 194 and 196.

### Conditions

- **authorization_role**: Admin role in an organization, using a browser session.
- **system_configuration**: The disparo_em_massa module is enabled on the installation. It is off by default.
- **system_configuration**: Reaching other tenants requires a multi-organization installation; the one app process serves all of them.

### Bounded local reproduction

**Principal:** An organization admin uploads a tiny crafted .xlsx through the prospecting spreadsheet import (also reachable in preview mode).

**Inputs:**

- `xlsx = minimal xl/workbook.xml, rels and a valid sheet1.xml (header + 1 data row) + xl/sharedStrings.xml = '<sst>' + '<si>' x k + '</sst>' with no closing </si>, deflated at level 9 (k=128000 is a 1,328-byte file).`
- `Variant: sheet1.xml ending in '<row>' x k with no closing </row> (k=32000 is a 950-byte file).`

**Instructions:**

1. In the network-less sandbox, build each workbook in memory with fflate from the target's node_modules (verifier harness h/measure-regex.mts).
2. In a fresh tsx process per size, time one call of the target's parseImportFile(bytes, 'lista.xlsx', {maxLinhas: 2000}) for k = 4000, 8000, 16000, 32000, 64000 and 128000 (<si>), and k = 8000, 16000, 32000 (<row>).
3. Repeat k=16000 and 32000 (<si>) through lib/crm-b2b/spreadsheet.ts to confirm the sibling shares the pattern.

**Observed result:**

Verifier's own bounded reproduction (agents/verifier-planilha/artifacts/evidence/xlsx-unterminated-tag-timing.log). ler-arquivo.ts with <si>: k=4000 17 ms; 8000 53 ms; 16000 263 ms; 32000 760 ms; 64000 2,707 ms (1,080-byte upload); 128000 12,721 ms (1,328-byte upload). With <row>: 8000 54 ms; 16000 211 ms; 32000 766 ms. Time grows about 3.5-4.7x per doubling, and every run returned ok:true with 1 data row. Sibling crm-b2b/spreadsheet.ts: 16000 161 ms; 32000 712 ms. Larger sizes were not run. Extrapolated from the measured growth, not run: about 1M tags (still a few KB zipped) would take about 13 minutes, and the 40 MiB per-entry cap (about 10.5M tags) would allow hours.

### Remediation

Replace every regex scan over inflated XML in parseXlsx with forward scans that stay linear on malformed input. For elements (<si>, <row>, <c>, <t>, <v>), use one helper that finds each opening tag with indexOf, finds its '>' once, and searches for the closing tag only until the first search that finds none. If no closing tag exists after some position, none exists after any later position, so from then on only self-closing tags can match and the tail is never re-read. A forward scan that runs indexOf for the closing tag again after every unterminated opening tag is still quadratic: measured at 4,145 ms for 32,000 unterminated <si> (slower than the current regex) and 64,016 ms for 128,000. The helper below took 50 ms for 1,000,000 and returned the same results as the current regexes on well-formed XLSX XML (agents/final-arquivos/artifacts/evidence/xlsx-fix-helper-timing.log). For opening tags only (<sheet at line 164 and <Relationship at line 167), use a second helper that stops at the first opening tag with no '>'. Those two lines have the same class of cost. A <sheet or <Relationship with no '>', repeated 32,000 times, took 3,223 ms (workbook.xml) and 6,308 ms (rels) from uploads under 1.5 KB (agents/final-arquivos/artifacts/evidence/xlsx-workbook-rels-regex-timing.log), so a fix that covers only lines 111, 125, 174, 180 and 186 leaves the parse quadratic. Apply the same helpers to lib/crm-b2b/spreadsheet.ts (lines 101, 116, 173, 176, 190, 194 and 196), which a manager can reach through app/api/v1/imports/route.ts. Optionally, also cap the sharedStrings and sheet XML that are read well below 40 MiB. Add a regression test that times unterminated <si>, <row>, <c>, <t> and <v> inputs, and <sheet and <Relationship inputs with no '>', at about 1M tags each, and expects each to finish well under one second.

`lib/planilha/ler-arquivo.ts`

```
/** Every <tag ...>body</tag> or <tag .../> in order, O(n) even on unterminated tags. If no closing
 *  tag exists after some position, none exists after any later one: the closing tag is never searched
 *  for again, and only self-closing tags can still match. */
function elementos(xml: string, tag: string): Array<[attrs: string, corpo: string | undefined]> {
  const abre = `<${tag}`;
  const fecha = `</${tag}>`;
  const out: Array<[string, string | undefined]> = [];
  let semFechamento = false;
  let i = 0;
  for (;;) {
    const a = xml.indexOf(abre, i);
    if (a === -1) break;
    const ini = a + abre.length;
    if (/\w/.test(xml[ini] ?? "")) { i = ini; continue; } // word boundary: <rows> is not <row>
    const gt = xml.indexOf(">", ini);
    if (gt === -1) break; // no '>' left: nothing further can match
    if (xml[gt - 1] === "/") { out.push([xml.slice(ini, gt - 1), undefined]); i = gt + 1; continue; }
    const f = semFechamento ? -1 : xml.indexOf(fecha, gt + 1);
    if (f === -1) { semFechamento = true; i = gt + 1; continue; } // unterminated: remember, never rescan the tail
    out.push([xml.slice(ini, gt), xml.slice(gt + 1, f)]);
    i = f + fecha.length;
  }
  return out;
}

/** The attributes of every opening <tag ...> in order, O(n); stops at the first one with no '>'. */
function aberturas(xml: string, tag: string): string[] {
  const abre = `<${tag}`;
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const a = xml.indexOf(abre, i);
    if (a === -1) break;
    const ini = a + abre.length;
    if (/\w/.test(xml[ini] ?? "")) { i = ini; continue; }
    const gt = xml.indexOf(">", ini);
    if (gt === -1) break;
    out.push(xml.slice(ini, gt));
    i = gt + 1;
  }
  return out;
}

// line 111 (textoDosRuns):
for (const [, c] of elementos(xml, "t")) out += decodificarXml(c ?? "");
// line 125 (valorDaCelula):
const v = elementos(corpo, "v").find(([, c]) => c !== undefined)?.[1];
// line 164:
const rid = aberturas(workbook, "sheet").map((a) => /\br:id="([^"]+)"/.exec(a)?.[1]).find(Boolean);
// lines 167-169:
for (const a of aberturas(rels, "Relationship")) {
  if (a.includes(`Id="${rid}"`)) alvo = /Target="([^"]+)"/.exec(a)?.[1];
}
// line 174:
const compartilhados = elementos(texto("xl/sharedStrings.xml") ?? "", "si").map(([, c]) => textoDosRuns(c ?? ""));
// lines 180-192:
for (const [attrs, corpo] of elementos(aba, "row")) {
  // ...rowNumber exactly as today, from attrs...
  for (const [cAttrs, cCorpo] of elementos(corpo ?? "", "c")) {
    const ref = /\br="([A-Z]+\d*)"/i.exec(cAttrs)?.[1];
    const i = ref ? indiceDaColuna(ref) : celulas.length;
    while (celulas.length < i) celulas.push("");
    celulas[i] = valorDaCelula(cAttrs, cCorpo ?? "", compartilhados);
  }
  // ...
}
// Apply the same helpers in lib/crm-b2b/spreadsheet.ts (lines 101, 116, 173, 176, 190, 194, 196).
```
