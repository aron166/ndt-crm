-- Bookings are tasks (BACKLOG 2026-09-12 item 2). Until now "demo lefoglalva"
-- was a lead STATUS with no date anywhere: `meeting_booked` moved the card to
-- demo_aron/demo_peter and wrote nothing you could put in a calendar.
--
-- starts_at    = when the visit actually starts. dueDate keeps its "do it by"
--                meaning for every other task; a booking sets both.
-- booking_kind = the rung of Péter's priority ladder that nothing in the schema
--                could express: multi-unit demo > single machine > job > private.
--                The money rungs are derived from deals.value / leads.estimated_value.
-- Duration reuses tasks.estimated_minutes — it already exists and already means
-- exactly this.
ALTER TABLE "tasks"
  ADD COLUMN "starts_at" TIMESTAMP(3),
  ADD COLUMN "booking_kind" TEXT;

-- The week view and the conflict check both scan "bookings in a date range".
CREATE INDEX "tasks_tenant_id_starts_at_idx" ON "tasks" ("tenant_id", "starts_at");
