-- Later migrations (lead_statuses 20260607190000 / 20260608000000 / 20260904100000)
-- seed rows hard-coded to tenant_id = 1, but nothing ever created that tenant: it was
-- only born in prisma/seed.ts, which runs AFTER `prisma migrate deploy`. On a clean
-- database the FK blew up and the whole deploy failed, so CI/DR could not rebuild the
-- schema. Create the default tenant here, before the first row that references it.
--
-- No-op on any database that already has tenant 1 (prod included).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "tenants" WHERE "id" = 1) THEN
    INSERT INTO "tenants" ("id", "name", "slug") VALUES (1, 'Controllabor Kft.', 'controllabor');
    -- advance the serial, never rewind it (a partial restore may hold higher ids)
    PERFORM setval(pg_get_serial_sequence('tenants', 'id'), GREATEST((SELECT MAX("id") FROM "tenants"), 1));
  END IF;
END $$;
