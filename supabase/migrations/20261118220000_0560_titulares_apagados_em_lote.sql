-- manifest: **A agenda do celular pergunta UMA vez por lote quais números foram apagados a pedido (LGPD).** Função `fn_titulares_apagados_a_pedido(uuid, text[])` devolve o SUBCONJUNTO dos telefones recebidos que casa com alguma marca de `lgpd_marcas_de_apagamento` (0526), pela mesma régua da pergunta unitária `fn_titular_apagado_a_pedido` (variantes do nono dígito, HMAC por sal de linha). Sem coluna nem tabela nova; só `service_role` executa. Trazida do produto original (9321) para a sincronização da agenda do celular, que lê até 1.000 números por passada.
--
-- Por que em lote: a pergunta unitária custa um round-trip por número; a agenda do aparelho entrega centenas de uma vez. Falha fechada fica com quem chama (sem resposta, nada é criado). Não cobre `lid`: a agenda não traz.

create or replace function public.fn_titulares_apagados_a_pedido(
  p_org uuid,
  p_telefones text[]
)
returns text[] language sql stable
set search_path = public, extensions, pg_temp as $$
  select coalesce(array_agg(t.telefone), '{}'::text[])
    from unnest(coalesce(p_telefones, '{}'::text[])) as t(telefone)
   where t.telefone is not null
     and exists (
       select 1
         from public.lgpd_marcas_de_apagamento m
        where m.organization_id = p_org
          and m.marca_telefone is not null
          and exists (
            select 1
              from unnest(public.fn_telefone_variantes(t.telefone)) as v(digitos)
             where m.marca_telefone = hmac(convert_to(v.digitos, 'UTF8'), m.sal, 'sha256')
          )
     );
$$;
-- AS DUAS ORIGENS DE EXECUTE: a resposta diz QUEM pediu apagamento, então nem
-- `anon` nem `authenticated` a fazem. Mesma negação da unitária.
revoke execute on function public.fn_titulares_apagados_a_pedido(uuid, text[]) from public, anon, authenticated;
grant execute on function public.fn_titulares_apagados_a_pedido(uuid, text[]) to service_role;

notify pgrst, 'reload schema';
