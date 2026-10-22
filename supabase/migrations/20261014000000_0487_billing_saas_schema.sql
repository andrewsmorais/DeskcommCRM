-- ============================================================================
-- Migration: 20261014000000_0487_billing_saas_schema.sql
-- Descrição: Regularização do schema de faturamento do ChatAI Online
--            (public.plans, public.subscriptions, public.asaas_customers, 
--             public.organization_billing)
-- Segurança: RLS habilitado, security_invoker = true na view para isolamento
--            multi-tenant, menor privilégio de roles (PUBLIC/anon/authenticated)
--            e garantia estrita de integridade 1:1 por organização.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- FUNÇÃO AUXILIAR CONDICIONAL: public.update_updated_at_column()
-- Preserva a função se já existir com a assinatura correta (trigger sem argumentos).
-- Cria a função de forma segura caso esteja ausente em ambientes novos.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    v_proc_exists BOOLEAN;
    v_is_valid_trigger BOOLEAN;
BEGIN
    SELECT 
        EXISTS (
            SELECT 1 FROM pg_proc p 
            JOIN pg_namespace n ON n.oid = p.pronamespace 
            WHERE n.nspname = 'public' AND p.proname = 'update_updated_at_column'
        ),
        EXISTS (
            SELECT 1 FROM pg_proc p 
            JOIN pg_namespace n ON n.oid = p.pronamespace 
            WHERE n.nspname = 'public' 
              AND p.proname = 'update_updated_at_column' 
              AND p.prorettype = 'trigger'::regtype 
              AND p.pronargs = 0
        )
    INTO v_proc_exists, v_is_valid_trigger;

    IF v_proc_exists THEN
        IF NOT v_is_valid_trigger THEN
            RAISE EXCEPTION 'MIGRATION ABORTED: Funcao public.update_updated_at_column() existe com assinatura incompativel (esperado: trigger sem argumentos).';
        END IF;
        -- Função existe e possui assinatura correta: preserva intacta sem substituir
    ELSE
        -- Função ausente: cria com hardening de search_path
        EXECUTE $create_func$
            CREATE FUNCTION public.update_updated_at_column()
            RETURNS TRIGGER
            LANGUAGE plpgsql
            SET search_path = public, pg_temp
            AS $f$
            BEGIN
                NEW.updated_at = now();
                RETURN NEW;
            END;
            $f$;
        $create_func$;
    END IF;
END $$;


-- ----------------------------------------------------------------------------
-- 1. TABELA: public.plans
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    slug TEXT NOT NULL UNIQUE,
    price_monthly INTEGER NOT NULL,
    price_quarterly INTEGER,
    price_yearly INTEGER,
    limits JSONB NOT NULL DEFAULT '{}'::jsonb,
    features JSONB NOT NULL DEFAULT '[]'::jsonb,
    min_attendants INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS em plans
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Política de leitura pública de planos (catálogo aberto para landing e checkout)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'plans' 
          AND policyname = 'plans_public_read'
    ) THEN
        CREATE POLICY "plans_public_read" ON public.plans
            FOR SELECT TO public USING (true);
    END IF;
END $$;

-- Privilégios em plans (Princípio do Menor Privilégio):
-- Revoga permissões amplas herdadas dos DEFAULT PRIVILEGES do Supabase
REVOKE ALL ON public.plans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.plans TO anon, authenticated, service_role;
GRANT ALL ON public.plans TO service_role;


-- ----------------------------------------------------------------------------
-- 2. TABELA: public.subscriptions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.plans(id),
    status TEXT DEFAULT 'pending',
    plan_type TEXT,
    billing_cycle TEXT NOT NULL DEFAULT 'monthly',
    seats INTEGER NOT NULL DEFAULT 1,
    asaas_customer_id TEXT,
    asaas_subscription_id TEXT,
    asaas_payment_id TEXT,
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Garantir presença de todas as colunas necessárias em caso de schema pré-existente
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_type TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS seats INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS billing_cycle TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS asaas_payment_id TEXT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2.1 Chaves estrangeiras com verificação (caso tabela pré-existente não as possua)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.subscriptions'::regclass 
          AND conname = 'subscriptions_organization_id_fkey'
    ) THEN
        ALTER TABLE public.subscriptions 
            ADD CONSTRAINT subscriptions_organization_id_fkey 
            FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.subscriptions'::regclass 
          AND conname = 'subscriptions_plan_id_fkey'
    ) THEN
        ALTER TABLE public.subscriptions 
            ADD CONSTRAINT subscriptions_plan_id_fkey 
            FOREIGN KEY (plan_id) REFERENCES public.plans(id);
    END IF;
END $$;

-- 2.2 Garantia de unicidade por organização em subscriptions (Falha explícita se houver duplicatas)
DO $$
DECLARE
    v_duplicate_count INTEGER;
BEGIN
    SELECT count(*) INTO v_duplicate_count
    FROM (
        SELECT organization_id
        FROM public.subscriptions
        WHERE organization_id IS NOT NULL
        GROUP BY organization_id
        HAVING count(*) > 1
    ) dup;

    IF v_duplicate_count > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Existem % organizacoes com assinaturas duplicadas em public.subscriptions. Regularize manualmente.', v_duplicate_count;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.subscriptions'::regclass 
          AND conname = 'subscriptions_organization_id_key'
    ) THEN
        ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_organization_id_key UNIQUE (organization_id);
    END IF;
END $$;

-- 2.3 Constraint de validação de status (aceita pending, trialing, active, past_due, suspended, canceled)
DO $$
DECLARE
    v_invalid_count INTEGER;
BEGIN
    SELECT count(*) INTO v_invalid_count
    FROM public.subscriptions
    WHERE status IS NOT NULL 
      AND status NOT IN ('pending', 'trialing', 'active', 'past_due', 'suspended', 'canceled');

    IF v_invalid_count > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Existem % assinaturas com status incompativel em public.subscriptions.', v_invalid_count;
    END IF;

    ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check 
        CHECK (status = ANY (ARRAY['pending'::text, 'trialing'::text, 'active'::text, 'past_due'::text, 'suspended'::text, 'canceled'::text]));
END $$;

-- 2.4 Constraint de ciclo de faturamento com validação prévia
DO $$
DECLARE
    v_invalid_cycle_count INTEGER;
BEGIN
    SELECT count(*) INTO v_invalid_cycle_count
    FROM public.subscriptions
    WHERE billing_cycle IS NOT NULL 
      AND billing_cycle NOT IN ('monthly', 'quarterly', 'yearly');

    IF v_invalid_cycle_count > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Existem % assinaturas com billing_cycle incompativel em public.subscriptions.', v_invalid_cycle_count;
    END IF;

    ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_billing_cycle_check;
    ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_billing_cycle_check 
        CHECK (billing_cycle = ANY (ARRAY['monthly'::text, 'quarterly'::text, 'yearly'::text]));
END $$;

-- 2.5 Índices essenciais para consultas do webhook e billing
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_asaas_sub_id 
    ON public.subscriptions(asaas_subscription_id) WHERE (asaas_subscription_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_subscriptions_org ON public.subscriptions(organization_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON public.subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);

-- 2.6 Trigger de atualização de updated_at
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger 
        WHERE tgrelid = 'public.subscriptions'::regclass 
          AND tgname = 'update_subscriptions_updated_at'
    ) THEN
        CREATE TRIGGER update_subscriptions_updated_at
            BEFORE UPDATE ON public.subscriptions
            FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
    END IF;
END $$;

-- 2.7 Habilitar RLS em subscriptions
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename = 'subscriptions' 
          AND policyname = 'Users can view own organization subscription'
    ) THEN
        CREATE POLICY "Users can view own organization subscription" ON public.subscriptions
            FOR SELECT TO public USING (
                organization_id IN (
                    SELECT user_organizations.organization_id
                    FROM public.user_organizations
                    WHERE user_organizations.user_id = auth.uid()
                )
            );
    END IF;
END $$;

-- Privilégios em subscriptions (Princípio do Menor Privilégio):
-- Apenas usuários autenticados leem (via RLS). Escritas ocorrem exclusivamente via backend/service_role.
REVOKE ALL ON public.subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;


-- ----------------------------------------------------------------------------
-- 3. TABELA: public.asaas_customers
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.asaas_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    asaas_customer_id TEXT NOT NULL UNIQUE,
    name TEXT,
    email TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3.1 Chave estrangeira com verificação em caso de tabela pré-existente
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.asaas_customers'::regclass 
          AND conname = 'asaas_customers_organization_id_fkey'
    ) THEN
        ALTER TABLE public.asaas_customers 
            ADD CONSTRAINT asaas_customers_organization_id_fkey 
            FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 3.2 Garantia de unicidade por organização em asaas_customers (suporta onConflict: 'organization_id')
DO $$
DECLARE
    v_dup_cust_count INTEGER;
BEGIN
    SELECT count(*) INTO v_dup_cust_count
    FROM (
        SELECT organization_id
        FROM public.asaas_customers
        GROUP BY organization_id
        HAVING count(*) > 1
    ) dup;

    IF v_dup_cust_count > 0 THEN
        RAISE EXCEPTION 'MIGRATION ABORTED: Existem % organizacoes duplicadas em public.asaas_customers. Regularize manualmente.', v_dup_cust_count;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conrelid = 'public.asaas_customers'::regclass 
          AND conname = 'asaas_customers_organization_id_key'
    ) THEN
        ALTER TABLE public.asaas_customers ADD CONSTRAINT asaas_customers_organization_id_key UNIQUE (organization_id);
    END IF;
END $$;

-- 3.3 Índices em asaas_customers
CREATE INDEX IF NOT EXISTS idx_asaas_customers_asaas_id ON public.asaas_customers(asaas_customer_id);
CREATE INDEX IF NOT EXISTS idx_asaas_customers_org ON public.asaas_customers(organization_id);

-- 3.4 Habilitar RLS em asaas_customers (Acesso restrito exclusivamente ao backend via service_role)
ALTER TABLE public.asaas_customers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asaas_customers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.asaas_customers TO service_role;


-- ----------------------------------------------------------------------------
-- 4. VIEW: public.organization_billing
-- ----------------------------------------------------------------------------
-- Criação ou substituição da view com security_invoker = true para garantir
-- que o PostgreSQL aplique as políticas RLS de organizations e subscriptions
-- no contexto do usuário autenticado solicitante, impedindo vazamento multi-tenant.
CREATE OR REPLACE VIEW public.organization_billing
WITH (security_invoker = true) AS
SELECT o.id AS organization_id,
       p.name AS plan_name,
       p.slug AS plan_slug,
       p.limits,
       s.status,
       s.current_period_end,
       s.asaas_subscription_id,
       ((s.status = ANY (ARRAY['trialing'::text, 'active'::text])) 
         OR (s.status = 'canceled'::text AND s.current_period_end > now())) AS is_active
FROM public.organizations o
LEFT JOIN public.subscriptions s ON s.organization_id = o.id
LEFT JOIN public.plans p ON p.id = s.plan_id;

-- Assegura aplicação de security_invoker mesmo se a view já existia no catálogo
ALTER VIEW public.organization_billing SET (security_invoker = true);

-- Privilégios na view (Princípio do Menor Privilégio):
-- 1. Revoga acesso amplo herdado dos DEFAULT PRIVILEGES do Supabase
REVOKE ALL ON public.organization_billing FROM PUBLIC, anon, authenticated;

-- 2. Concede apenas SELECT para authenticated (filtrado via RLS por security_invoker)
GRANT SELECT ON public.organization_billing TO authenticated;

-- 3. Concede acesso administrativo para service_role (backend com BYPASSRLS)
GRANT ALL ON public.organization_billing TO service_role;
