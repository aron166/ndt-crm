-- SELECT-only database role for the read tools (workspace tools/crm-ro.sh, labs/peter-cockpit, labs/morning-card).
-- Today those tools connect with the app's full role and rely on a READ ONLY transaction alone. This role makes
-- the database itself the fence: it can read exactly the tables below and nothing else, and can write nothing.
--
-- Not run by any deploy. Áron applies it once, by hand (psql, as the postgres owner role), see the PR body:
--   psql "$DIRECT_URL" -1 -v ON_ERROR_STOP=1 -v ro_password="$CRM_RO_PASSWORD" -f scripts/db/crm-readonly-role.sql
-- The password comes from the shell (-v), never from this file. -1 runs it as ONE transaction, so a re-run's
-- revoke-then-grant is never visible half-done to a live read tool. Re-running is safe: the role is created once
-- and the grants re-applied; it does NOT change the password. Rotate with:
--   echo "ALTER ROLE crm_ro PASSWORD :'pw'" | psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -v pw="$NEW_PASSWORD"
-- (psql does not substitute variables inside -c, so the statement comes on stdin.)
--
-- Rollback:
--   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM crm_ro; REVOKE USAGE ON SCHEMA public FROM crm_ro; DROP ROLE crm_ro;

\if :{?ro_password}
\else
  \echo 'ro_password is not set: pass -v ro_password=...'
  -- Fail loudly (non-zero exit under ON_ERROR_STOP), never a silent success.
  SELECT 1 / 0 AS ro_password_missing;
\endif

SELECT format('CREATE ROLE crm_ro LOGIN PASSWORD %L', :'ro_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'crm_ro') \gexec

ALTER ROLE crm_ro NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 3;
-- Belt and braces: every session of this role starts read only and cannot hang the database.
ALTER ROLE crm_ro SET default_transaction_read_only = on;
ALTER ROLE crm_ro SET statement_timeout = '15s';

-- Start from nothing in public, then grant only what the tools read.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM crm_ro;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM crm_ro;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM crm_ro;
GRANT USAGE ON SCHEMA public TO crm_ro;

GRANT SELECT ON
  leads, companies, contacts, persons, tasks, interactions, quotes, equipment
TO crm_ro;
-- tenants: the tools read settings (demoHosts, booking config); no other column.
GRANT SELECT (id, name, slug, settings) ON tenants TO crm_ro;
