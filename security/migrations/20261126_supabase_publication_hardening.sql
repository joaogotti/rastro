-- Registro das correções já aplicadas manualmente no Supabase ativo.
-- Este arquivo não é executado pelo deploy. Não reaplicar em produção.
BEGIN;
SET LOCAL search_path = pg_catalog;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investment_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE
  public.categories, public.investment_totals, public.investments,
  public.profiles, public.transactions
FROM anon, authenticated RESTRICT;

REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.categories, public.investment_totals, public.investments,
  public.profiles, public.transactions
FROM anon RESTRICT;

REVOKE EXECUTE ON FUNCTION
  public.handle_new_user(), public.rls_auto_enable(),
  public.update_updated_at(), public.validate_transaction_category()
FROM anon, authenticated RESTRICT;

-- Se outro grant (inclusive PUBLIC ou via herança) ainda der acesso,
-- aborte a transação para comparar o ambiente com o estado documentado.
DO $$
DECLARE
  tabela regclass;
  rotina regprocedure;
BEGIN
  FOREACH tabela IN ARRAY ARRAY[
    'public.categories'::regclass, 'public.investment_totals',
    'public.investments', 'public.profiles', 'public.transactions'
  ]
  LOOP
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = tabela) THEN
      RAISE EXCEPTION 'RLS desabilitada em %', tabela;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_roles AS r
      WHERE r.rolname IN ('anon', 'authenticated')
        AND (
          has_table_privilege(r.oid, tabela::oid, 'TRUNCATE, REFERENCES, TRIGGER')
          OR has_any_column_privilege(r.oid, tabela::oid, 'REFERENCES')
          OR (
            r.rolname = 'anon'
            AND (
              has_table_privilege(r.oid, tabela::oid, 'SELECT, INSERT, UPDATE, DELETE')
              OR has_any_column_privilege(r.oid, tabela::oid, 'SELECT, INSERT, UPDATE')
            )
          )
        )
    ) THEN
      RAISE EXCEPTION 'Privilégio ainda efetivo em %', tabela;
    END IF;
  END LOOP;

  FOREACH rotina IN ARRAY ARRAY[
    'public.handle_new_user()'::regprocedure, 'public.rls_auto_enable()',
    'public.update_updated_at()', 'public.validate_transaction_category()'
  ]
  LOOP
    IF has_function_privilege('anon', rotina::oid, 'EXECUTE')
       OR has_function_privilege('authenticated', rotina::oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'EXECUTE ainda efetivo em %', rotina;
    END IF;
  END LOOP;
END;
$$;

COMMIT;
