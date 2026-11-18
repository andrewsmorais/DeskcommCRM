-- manifest: **Etiqueta da campanha de prospecção no contato, sem corrida.** Função `fn_contato_adicionar_etiquetas(org, contato, etiquetas[])` (vinda do produto original, 0682 de lá): acrescenta as etiquetas dentro do UPDATE, atômica, e devolve as gravadas e as novas; `security definer`, só `service_role`. A prospecção já chamava esta função e ela não existia aqui. Idempotente.
-- A prospecção põe as etiquetas da campanha no contato pela MESMA junção atômica
-- do produto original (migration 0682 de lá): o acréscimo acontece dentro do
-- UPDATE, então dois eventos ao mesmo tempo não apagam a etiqueta um do outro.
-- Só para o servidor (service_role). Idempotente: `create or replace`.
create or replace function public.fn_contato_adicionar_etiquetas(
  p_org uuid,
  p_contato uuid,
  p_etiquetas text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_antes       text[];
  v_adicionadas text[];
  v_depois      text[];
begin
  if p_etiquetas is null or cardinality(p_etiquetas) = 0 then
    raise exception 'etiquetas_vazio' using errcode = '22023';
  end if;

  -- Irmã da de cima, na tabela do CONTATO: o destino `contato` da #2498 escreve
  -- aqui, e ali a corrida é a MESMA — dois eventos distintos do mesmo contato em
  -- drenos diferentes. Corpo idêntico trocando a tabela e o nome do parâmetro.
  select coalesce(tags, '{}'::text[])
    into v_antes
    from public.contacts
   where organization_id = p_org and id = p_contato
     for update;
  if not found then
    return null;
  end if;

  v_adicionadas := array(select unnest(p_etiquetas) except select unnest(v_antes));

  if cardinality(v_adicionadas) = 0 then
    return jsonb_build_object('tags', to_jsonb(v_antes), 'adicionadas', '[]'::jsonb);
  end if;

  update public.contacts
     set tags = coalesce(tags, '{}'::text[])
                || array(select unnest(p_etiquetas) except select unnest(coalesce(tags, '{}'::text[]))),
         updated_at = now()
   where organization_id = p_org and id = p_contato
   returning tags into v_depois;

  return jsonb_build_object(
    'tags', to_jsonb(coalesce(v_depois, '{}'::text[])),
    'adicionadas', to_jsonb(v_adicionadas)
  );
end
$fn$;

-- Função nova em `public` nasce exposta pelas duas origens (default ACL e PUBLIC):
-- revoga as duas e devolve só ao servidor.
revoke all on function public.fn_contato_adicionar_etiquetas(uuid, uuid, text[]) from public, anon, authenticated;
grant execute on function public.fn_contato_adicionar_etiquetas(uuid, uuid, text[]) to service_role;

comment on function public.fn_contato_adicionar_etiquetas(uuid, uuid, text[]) is
  'Acrescenta etiquetas ao contato DENTRO do UPDATE, numa única instrução atômica, e devolve as etiquetas gravadas e as novas. Não decide papel nem organização — isso é de quem chama.';

notify pgrst, 'reload schema';
