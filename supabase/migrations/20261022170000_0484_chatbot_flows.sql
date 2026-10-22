-- migration 0484 — Chatbot Builder: flows, nodes, edges, sessions
-- Fluxos visuais de chatbot (canvas estilo Umbler Talk), sem custo de IA.
-- Cada tenant tem seus próprios flows. RLS via fn_user_org_ids().

-- ── chatbot_flows ──────────────────────────────────────────────────────────
create table if not exists public.chatbot_flows (
  id                uuid        not null default gen_random_uuid() primary key,
  organization_id   uuid        not null references public.organizations(id) on delete cascade,
  name              text        not null,
  description       text,
  is_active         boolean     not null default false,
  trigger_channel   uuid        references public.channels(id) on delete set null,
  -- 'draft' | 'active' | 'archived'
  status            text        not null default 'draft'
                    check (status in ('draft', 'active', 'archived')),
  created_by        uuid        references auth.users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_chatbot_flows_org
  on public.chatbot_flows (organization_id);

alter table public.chatbot_flows enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'chatbot_flows'
      and policyname = 'tenant_isolation_chatbot_flows_all'
  ) then
    create policy tenant_isolation_chatbot_flows_all
      on public.chatbot_flows
      for all
      using (organization_id = any(public.fn_user_org_ids()));
  end if;
end $$;

-- ── chatbot_nodes ──────────────────────────────────────────────────────────
-- Um nó por elemento do canvas. `data` é jsonb livre por tipo de nó.
create table if not exists public.chatbot_nodes (
  id               uuid        not null default gen_random_uuid() primary key,
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  flow_id          uuid        not null references public.chatbot_flows(id) on delete cascade,
  -- tipo de nó: 'start' | 'message' | 'condition' | 'action' | 'transfer'
  -- | 'wait' | 'webhook' | 'end'  (text+check — não enum, fácil de estender)
  node_type        text        not null,
  label            text        not null default '',
  -- posição no canvas
  pos_x            numeric     not null default 0,
  pos_y            numeric     not null default 0,
  -- dados do nó (texto, opções, condições, etc.)
  data             jsonb       not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_chatbot_nodes_flow
  on public.chatbot_nodes (flow_id);
create index if not exists idx_chatbot_nodes_org
  on public.chatbot_nodes (organization_id);

alter table public.chatbot_nodes enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'chatbot_nodes'
      and policyname = 'tenant_isolation_chatbot_nodes_all'
  ) then
    create policy tenant_isolation_chatbot_nodes_all
      on public.chatbot_nodes
      for all
      using (organization_id = any(public.fn_user_org_ids()));
  end if;
end $$;

-- ── chatbot_edges ──────────────────────────────────────────────────────────
-- Conexão direcional entre nós. `label` é o texto da aresta (ex: "Sim", "Não").
create table if not exists public.chatbot_edges (
  id               uuid        not null default gen_random_uuid() primary key,
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  flow_id          uuid        not null references public.chatbot_flows(id) on delete cascade,
  source_node_id   uuid        not null references public.chatbot_nodes(id) on delete cascade,
  target_node_id   uuid        not null references public.chatbot_nodes(id) on delete cascade,
  source_handle    text,   -- handle de saída no nó (ex: 'yes', 'no', 'default')
  target_handle    text,   -- handle de entrada no nó destino
  label            text,
  created_at       timestamptz not null default now()
);

create index if not exists idx_chatbot_edges_flow
  on public.chatbot_edges (flow_id);
create index if not exists idx_chatbot_edges_org
  on public.chatbot_edges (organization_id);
create index if not exists idx_chatbot_edges_source
  on public.chatbot_edges (source_node_id);

alter table public.chatbot_edges enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'chatbot_edges'
      and policyname = 'tenant_isolation_chatbot_edges_all'
  ) then
    create policy tenant_isolation_chatbot_edges_all
      on public.chatbot_edges
      for all
      using (organization_id = any(public.fn_user_org_ids()));
  end if;
end $$;

-- ── chatbot_sessions ───────────────────────────────────────────────────────
-- Estado de execução de um fluxo por conversa.
create table if not exists public.chatbot_sessions (
  id                  uuid        not null default gen_random_uuid() primary key,
  organization_id     uuid        not null references public.organizations(id) on delete cascade,
  flow_id             uuid        not null references public.chatbot_flows(id) on delete cascade,
  conversation_id     uuid        not null references public.conversations(id) on delete cascade,
  current_node_id     uuid        references public.chatbot_nodes(id) on delete set null,
  -- 'running' | 'waiting_input' | 'completed' | 'transferred' | 'error'
  status              text        not null default 'running',
  -- dados coletados durante o fluxo (respostas, variáveis)
  collected_data      jsonb       not null default '{}'::jsonb,
  started_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  ended_at            timestamptz,
  -- unicidade: uma sessão ativa por conversa
  unique (organization_id, conversation_id, flow_id)
);

create index if not exists idx_chatbot_sessions_org
  on public.chatbot_sessions (organization_id);
create index if not exists idx_chatbot_sessions_conversation
  on public.chatbot_sessions (conversation_id);
create index if not exists idx_chatbot_sessions_flow
  on public.chatbot_sessions (flow_id);

alter table public.chatbot_sessions enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'chatbot_sessions'
      and policyname = 'tenant_isolation_chatbot_sessions_all'
  ) then
    create policy tenant_isolation_chatbot_sessions_all
      on public.chatbot_sessions
      for all
      using (organization_id = any(public.fn_user_org_ids()));
  end if;
end $$;
