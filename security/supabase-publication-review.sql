-- Execute no SQL Editor do projeto correto. A consulta lista metadados, sem ler registros de aplicação.
BEGIN TRANSACTION READ ONLY;

-- Metadados das relações e RLS. Uma linha sem OID indica tabela ausente.
WITH scope(schema_name, table_name) AS (
  VALUES ('public', 'profiles'),
         ('public', 'categories'),
         ('public', 'transactions'),
         ('public', 'investment_totals'),
         ('public', 'investments'),
         ('public', 'investment_events'),
         ('public', 'investment_kinds'),
         ('public', 'investment_valuations'),
         ('storage', 'objects'),
         ('storage', 'buckets')
)
SELECT scope.*, c.oid IS NOT NULL AS exists_in_database,
       c.relkind, pg_get_userbyid(c.relowner) AS owner,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM scope
LEFT JOIN pg_namespace AS n ON n.nspname = scope.schema_name
LEFT JOIN pg_class AS c ON c.relnamespace = n.oid AND c.relname = scope.table_name
ORDER BY 1, 2;

-- Políticas efetivas sobre cada ação, incluindo restrições de escrita.
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE (schemaname = 'public' AND tablename IN ('profiles', 'categories', 'transactions', 'investment_totals', 'investments', 'investment_events', 'investment_kinds', 'investment_valuations'))
   OR (schemaname = 'storage' AND tablename IN ('objects', 'buckets'))
ORDER BY 1, 2, 3;

-- Grants efetivos dos papéis da Data API, incluindo herança e PUBLIC.
SELECT n.nspname AS schema_name, c.relname AS relation_name, r.rolname,
       has_schema_privilege(r.oid, n.oid, 'USAGE') AS schema_usage,
       has_table_privilege(r.oid, c.oid, 'SELECT') AS can_select,
       has_table_privilege(r.oid, c.oid, 'INSERT') AS can_insert,
       has_table_privilege(r.oid, c.oid, 'UPDATE') AS can_update,
       has_table_privilege(r.oid, c.oid, 'DELETE') AS can_delete,
       has_table_privilege(r.oid, c.oid, 'TRUNCATE') AS can_truncate,
       has_table_privilege(r.oid, c.oid, 'TRIGGER') AS can_trigger,
       has_table_privilege(r.oid, c.oid, 'REFERENCES') AS can_reference,
       has_any_column_privilege(r.oid, c.oid, 'REFERENCES') AS can_reference_any_column,
       has_any_column_privilege(r.oid, c.oid, 'INSERT') AS can_insert_any_column,
       has_any_column_privilege(r.oid, c.oid, 'SELECT') AS can_select_any_column,
       has_any_column_privilege(r.oid, c.oid, 'UPDATE') AS can_update_any_column
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN pg_roles AS r
WHERE r.rolname IN ('anon', 'authenticated', 'service_role')
  AND ((n.nspname = 'public' AND c.relname IN ('profiles', 'categories', 'transactions', 'investment_totals', 'investments', 'investment_events', 'investment_kinds', 'investment_valuations'))
    OR (n.nspname = 'storage' AND c.relname IN ('objects', 'buckets')))
ORDER BY 1, 2, 3;

SELECT rolname, rolsuper, rolbypassrls, rolinherit
FROM pg_roles
WHERE rolname IN ('anon', 'authenticated', 'service_role')
ORDER BY rolname;

-- Privilégios de coluna explícitos, que podem existir sem grant de tabela.
SELECT n.nspname, c.relname, a.attname,
       CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE pg_get_userbyid(acl.grantee) END AS grantee,
       acl.privilege_type, acl.is_grantable
FROM pg_attribute AS a
JOIN pg_class AS c ON c.oid = a.attrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
CROSS JOIN LATERAL aclexplode(a.attacl) AS acl
WHERE a.attnum > 0 AND NOT a.attisdropped
  AND n.nspname = 'public' AND c.relname IN ('profiles', 'categories', 'transactions', 'investment_totals', 'investments', 'investment_events', 'investment_kinds', 'investment_valuations')
ORDER BY 1, 2, 3, 4, 5;

-- Funções com privilégios do proprietário, funções ligadas a triggers e RPCs conhecidos.
SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS signature,
       pg_get_userbyid(p.proowner) AS owner, owner_role.rolbypassrls AS owner_bypasses_rls,
       p.prosecdef AS security_definer,
       (SELECT setting FROM unnest(p.proconfig) AS cfg(setting) WHERE setting LIKE 'search_path=%') AS search_path,
       EXISTS (SELECT 1 FROM pg_trigger AS t WHERE t.tgfoid = p.oid AND NOT t.tgisinternal) AS has_trigger,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
       EXISTS (
         SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) AS acl
         WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
       ) AS public_execute
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_roles AS owner_role ON owner_role.oid = p.proowner
WHERE n.nspname IN ('public', 'rastro_investment_private') AND p.prokind IN ('f', 'p')
  AND (p.prosecdef
    OR (n.nspname = 'public' AND p.proname IN (
      'handle_new_user', 'rls_auto_enable', 'update_updated_at', 'validate_transaction_category'
    ))
    OR EXISTS (SELECT 1 FROM pg_trigger AS t WHERE t.tgfoid = p.oid AND NOT t.tgisinternal))
ORDER BY 1, 2, 3;

-- Configuração de buckets. A consulta não lista arquivos nem objetos.
SELECT id AS bucket_id, public AS public_download, file_size_limit, allowed_mime_types
FROM storage.buckets
ORDER BY id;

ROLLBACK;
