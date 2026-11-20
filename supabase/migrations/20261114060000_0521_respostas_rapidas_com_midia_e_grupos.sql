-- 0521: Respostas rápidas com imagem e áudio, ordem própria, grupos e
-- "mostrar na barra do Inbox" (vindo do produto original: 0643, 0729, 0742, 0808).
--
-- Tudo aditivo e idempotente: quem já tem respostas rápidas continua vendo a
-- lista de sempre (sem mídia, sem grupo, na mesma ordem, todas na barra).
-- Os arquivos ficam no bucket privado `whatsapp-media`, sob o prefixo do
-- template; quem grava e lê é a rota com a sessão do usuário.

-- ---- parte vinda de 0643_midia_da_resposta_rapida ----
-- 0643: `message_templates.midias` guarda a DESCRIÇÃO das imagens do template.
--
-- ─── Por que uma coluna, e por que jsonb ───────────────────────────────────
--
-- A ligação é com UM template e não tem histórico próprio: a lista é reescrita
-- por inteiro quando o operador remove ou substitui uma imagem — o mesmo
-- desenho de `catalog_products.fotos` (text[] desde a 0390), que é a referência
-- técnica citada na issue. Uma tabela de filhas acrescentaria RLS, cascade e
-- uma contagem de linha para uma relação que só se lê inteira.
--
-- jsonb (e não text[]) porque a linha guarda os TRÊS campos que o envio
-- precisa: `storage_path`, `media_mime` e `media_size_bytes` — os mesmos
-- `media_*` de `messages` que o dispatcher de mídia já consome. Guardar só o
-- caminho empurraria a leitura do mime e do tamanho para o momento do envio,
-- e o mime seria adivinhado da extensão.
--
-- ─── Idempotente ───────────────────────────────────────────────────────────
--
-- `add column if not exists` + `drop constraint if exists` antes de cada
-- `add constraint`: instalação nova e `update.sh` de banco existente correm o
-- mesmo arquivo. Nada é backfillado — o default `[]` cobre as linhas atuais e
-- um template SÓ de texto continua saindo byte a byte como antes (#2526, o
-- caso que não pode mudar de comportamento).
alter table message_templates
  add column if not exists midias jsonb not null default '[]';

-- O teto do formulário (MAXIMO_DE_MIDIAS = 5) também no banco: a rota e o
-- schema Zod já recusam mais, e este CHECK é a régua de quem grava direto pelo
-- PostgREST. O `case when` existe porque `jsonb_array_length` de um não-array
-- ERRA, e um erro em CHECK não vira violação de constraint — vira falha obscura
-- no insert de quem mandou json torto.
alter table message_templates drop constraint if exists message_templates_midias_maxima;
alter table message_templates
  add constraint message_templates_midias_maxima
  check (case when jsonb_typeof(midias) = 'array' then jsonb_array_length(midias) <= 5 else false end);

-- ---- parte vinda de 0729_ordem_da_resposta_rapida ----
--
-- 0729: `message_templates.ordem` é a POSIÇÃO da resposta rápida na lista da organização.
--
-- ─── O defeito que isto resolve ─────────────────────────────────────────────
-- A listagem (`app/api/v1/message-templates/route.ts`) devolvia as respostas
-- rápidas por `updated_at desc`: a ordem era a de mais recentemente EDITADO, não
-- a que o operador escolhe. Editar o corpo de uma resposta a empurrava para o
-- topo da lista e para o topo do slash-menu do Inbox, e não havia como voltar —
-- a tela não oferecia reordenar. A ordem passa a ser DADO da linha, e é ela que
-- a tela arrasta e o Inbox herda.
--
-- ─── Por que fracionária (numeric) e não inteiro ────────────────────────────
-- A posição nasce do VIZINHO (`depois_de`), não de um número mandado pela tela:
-- soltar entre duas respostas grava a média entre elas (`lib/templates/ordem.ts`)
-- e só a linha arrastada é escrita — as vizinhas ficam intactas, e um PATCH de
-- conteúdo não reescreve a lista. Inteiro exigiria renumerar a lista inteira a
-- cada arrasto (e renumerar linha que o papel não pode escrever pela RLS).
-- `numeric`, como `position_in_stage`: a coluna guarda exatamente o número que a
-- rota gravou. A média é calculada em JS (double); quando ela não cabe mais
-- estritamente entre as duas vizinhas, ou quando elas empatam, a rota renumera a
-- lista visível com passos de `1000`.
--
-- ─── Idempotente ────────────────────────────────────────────────────────────
-- O `do` abaixo não é enfeite: `install.sh` (banco novo) e `update.sh` (banco
-- existente) aplicam ESTE arquivo, e o apêndice do `baseline.sql` repete o mesmo
-- texto. O `if not exists` da coluna seria suficiente para não quebrar, mas não
-- para o BACKFILL: sem o guarda da coluna, cada `update.sh` renumeraria a lista
-- pela data de edição e apagaria a ordem que o operador escolheu. O guarda mede
-- o nascimento da coluna, não o conteúdo — por isso a escolha do usuário
-- sobrevive a toda atualização. Em banco novo a tabela está vazia e o backfill
-- não escreve linha nenhuma.

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'message_templates'
      and column_name = 'ordem'
  ) then
    alter table public.message_templates
      add column ordem numeric not null default 0;

    with numeradas as (
      select
        id,
        row_number() over (
          partition by organization_id
          order by updated_at desc, id
        )::numeric * 1000 as posicao
      from public.message_templates
    )
    update public.message_templates as m
      set ordem = numeradas.posicao
      from numeradas
      where numeradas.id = m.id;
  end if;
end $$;

-- O índice da LEITURA: a listagem filtra por organização e ordena por `ordem`
-- (é o caminho de toda abertura do Inbox e da tela). O `idx_message_templates_org`
-- da 0060 fica: ele serve a RLS e as contagens por organização.
create index if not exists idx_message_templates_org_ordem
  on public.message_templates (organization_id, ordem);

-- ---- parte vinda de 0742_mostrar_na_barra_do_inbox ----

-- ─── O que isto resolve ─────────────────────────────────────────────────────
-- A barra de recursos do Inbox (#2833) monta um botão por linha de
-- `message_templates` da organização. Numa agência com dezenas de respostas a
-- barra vira uma nuvem de várias linhas acima do compositor, e aparecem ali
-- textos que ninguém escolhe à mão (modelos de um follow-up, mensagens usadas
-- só pelo atalho `/`). Até aqui a única saída era apagar a resposta — e isso a
-- tirava também do `/`.
--
-- Esta coluna é a MARCAÇÃO por resposta rápida: `false` esconde o botão da
-- barra do Inbox; `true` (default) mantém o comportamento de hoje. A barra lê o
-- campo; o atalho `/` ignora-o de propósito e continua listando TODAS.
--
-- ─── A decisão de escopo desta fatia ────────────────────────────────────────
-- A coluna NÃO entra na ordenação por arrastar nem em grupos (#3244 e #3245
-- conversam com a issue e têm PR na região): a barra só ganha a marcação e o
-- recolhimento. O limite de botões definido pelo administrador (item 3 da
-- issue) fica FORA, é opcional.
--
-- ─── Compatibilidade ────────────────────────────────────────────────────────
-- `add column if not exists` + `default true`: linhas que já existem ficam
-- marcadas para aparecer — byte a byte o comportamento atual. Linha anterior a
-- esta migration (e fixture que não traz a chave) é "aparece", nunca "some".

alter table public.message_templates
  add column if not exists mostrar_na_barra boolean not null default true;

comment on column public.message_templates.mostrar_na_barra is
  'Se a resposta rápida aparece na barra do Inbox (#3282). Default true: a ausência da marcação e a marcação ligada mantêm o comportamento de sempre. O atalho / lista TODAS, independente deste campo.';

-- ---- parte vinda de 0808_grupos_de_resposta_rapida ----

-- 0808 — grupos de respostas rápidas.
--
-- ─── O que entra ───────────────────────────────────────────────────────────
--
--   1. `message_template_groups`: o grupo ("Atendimento inicial", "Follow-up",
--      "Negociação"…). O nome é único por organização com `lower(btrim(name))`
--      — "Follow-up" e "follow-up " seriam o mesmo grupo para quem lê a tela.
--      A ordem é a da exibição, fracionária (`numeric`) como
--      `message_templates.ordem` (0729), para reordenar sem renumerar a lista.
--   2. `message_templates.grupo_id`: o VÍNCULO, NULÁVEL de propósito. É ele que
--      torna o recurso opcional: linha anterior a esta migration (e resposta que
--      a tela não vinculou) fica `null`, e `null` é "lista plana de hoje".
--
-- ─── Por que FK COMPOSTA, e não uma FK simples em `grupo_id` ───────────────
--
-- Uma FK simples só conhece o id: um corpo forjado gravaria `grupo_id` de
-- OUTRA organização — o id existe, a FK aceita, e a resposta passa a apontar
-- para um grupo que quem gravou nem lê. A FK composta `(organization_id,
-- grupo_id)` exige que o par exista do outro lado, e o par só existe se o grupo
-- for da mesma organização (é a mesma régua de `attendant_sector_members`).
--
-- ─── Por que `on delete set null (grupo_id)` e não cascata ────────────────
--
-- Apagar um grupo não pode apagar as respostas rápidas: elas são o conteúdo que
-- a equipe usa todo dia, e "excluí o grupo" não é "excluí os scripts". O
-- `(grupo_id)` da lista de colunas é obrigatório — sem ele o SET NULL tentaria
-- anular `organization_id` junto, que é NOT NULL, e o DELETE explodiria só na
-- hora de apagar um grupo com respostas, em produção.
--
-- ─── Compatibilidade ───────────────────────────────────────────────────────
--
-- Tabela nova e coluna NULÁVEL, sem backfill: nenhuma resposta existente muda
-- de lugar, nenhuma tela passa a agrupar por conta própria. Tudo
-- `if not exists` / `drop constraint if exists` — reaplicável pelo `update.sh`.
-- O recurso é OPCIONAL: quem nunca criar grupo continua com a lista plana.

create table if not exists public.message_template_groups (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 60),
  -- Mesma unidade de `message_templates.ordem` (0729): a posição nasce do
  -- VIZINHO, e a média entre duas vizinhas só precisa caber em `numeric`.
  ordem           numeric not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Alvo da FK composta que vem abaixo: o par (organização, grupo) é o que a
  -- resposta rápida referencia.
  unique (organization_id, id)
);

create unique index if not exists message_template_groups_org_name_unique
  on public.message_template_groups (organization_id, lower(btrim(name)));

-- O caminho da leitura: a tela lista os grupos da organização na ordem da
-- exibição. O índice do nome único não serve para ordenar.
create index if not exists idx_message_template_groups_org_ordem
  on public.message_template_groups (organization_id, ordem);

alter table public.message_template_groups enable row level security;

-- Privilégio EXPLÍCITO: tabela nova em `public` não herda o grant da tabela
-- vizinha, e sem esta linha `authenticated` perde select/insert/update/delete.
-- `anon` fica sem privilégio nenhum — a policy abaixo nem é avaliada para ele.
revoke all on public.message_template_groups from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.message_template_groups to authenticated;
grant select, insert, update, delete on public.message_template_groups to service_role;

drop policy if exists message_template_groups_select on public.message_template_groups;
create policy message_template_groups_select on public.message_template_groups
  for select to authenticated
  using (organization_id in (select public.fn_user_org_ids()) or public.fn_is_platform_admin());

-- Escrita por `manager+`: o grupo é estrutura COMPARTILHADA da organização (a
-- mesma régua da resposta rápida com `owner_user_id` nulo). `agent` lê e
-- vincula a própria resposta a um grupo existente, mas não cria, renomeia,
-- reordena nem apaga a estrutura da equipe.
drop policy if exists message_template_groups_write on public.message_template_groups;
create policy message_template_groups_write on public.message_template_groups
  for all to authenticated
  using (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'manager')
  )
  with check (
    organization_id in (select public.fn_user_org_ids())
      and public.fn_role_at_least(organization_id, 'manager')
  );

-- A coluna do vínculo nasce NULÁVEL: `null` = "sem grupo", que é a lista plana
-- de hoje. O guarda medida o NASCIMENTO da coluna (não o conteúdo), então
-- reaplicar não reescreve vínculo nenhum.
do $grupo_id$
begin
  if to_regclass('public.message_template_groups') is null
     or to_regclass('public.message_templates') is null then
    return;
  end if;

  alter table public.message_templates
    add column if not exists grupo_id uuid;
end
$grupo_id$;

-- A FK composta: o par (organização, grupo) tem de existir do outro lado.
-- `drop` antes do `add` porque `add constraint` não é idempotente, e num clone
-- que já tem a constraint a versão vigente é esta.
do $vinculo$
begin
  if to_regclass('public.message_template_groups') is null
     or to_regclass('public.message_templates') is null
     or not exists (
       select 1
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'message_templates'
          and column_name = 'grupo_id'
     ) then
    return;
  end if;

  alter table public.message_templates
    drop constraint if exists message_templates_grupo_fkey;

  alter table public.message_templates
    add constraint message_templates_grupo_fkey
    foreign key (organization_id, grupo_id)
    references public.message_template_groups (organization_id, id)
    on delete set null (grupo_id);
end
$vinculo$;

-- O `on delete set null` da FK varre as respostas do grupo apagado: sem este
-- índice, apagar um grupo faz seq scan em `message_templates`.
create index if not exists idx_message_templates_grupo
  on public.message_templates (grupo_id);

-- Os comentários ficam DENTRO da guarda: `comment on column` de coluna que não
-- existe é erro fatal, e `update.sh` roda sem `ON_ERROR_STOP` — o comentário
-- falharia calado num clone cuja tabela ainda não nasceu.
do $comentarios$
begin
  if to_regclass('public.message_template_groups') is not null then
    comment on table public.message_template_groups is
      'Grupos OPCIONAIS de respostas rápidas (#3245, migration 0808). Nome único por organização (lower/btrim). Sem grupo, a tela e o Inbox mostram a lista plana de sempre. Escrita por manager+; leitura por qualquer membro.';
    comment on column public.message_template_groups.name is
      'Nome do grupo como a equipe o lê ("Atendimento inicial", "Negociação"). Único por organização sem diferenciar caixa nem espaço.';
    comment on column public.message_template_groups.ordem is
      'Posição do grupo na exibição, fracionária como message_templates.ordem (0729): reordenar grava a média entre as vizinhas e não renumera a lista.';
  end if;

  if to_regclass('public.message_templates') is not null
     and exists (
       select 1
         from information_schema.columns
        where table_schema = 'public'
          and table_name = 'message_templates'
          and column_name = 'grupo_id'
     ) then
    comment on column public.message_templates.grupo_id is
      'Grupo OPCIONAL da resposta rápida (#3245, migration 0808). NULL = sem grupo: a resposta aparece na lista plana de sempre. FK composta (organization_id, grupo_id); apagar o grupo devolve a resposta a "sem grupo", nunca a apaga.';
  end if;
end
$comentarios$;

notify pgrst, 'reload schema';

