-- Feature E2 part 2: a campaign's target AUDIENCE = a saved company view
-- (segment). Nullable FK, resolved live (no membership snapshot) so the audience
-- tracks the underlying company data. ON DELETE SET NULL: deleting a saved view
-- detaches it from any campaign rather than cascading the campaign away.

ALTER TABLE "campaigns" ADD COLUMN "audience_view_id" INTEGER;

ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_audience_view_id_fkey"
    FOREIGN KEY ("audience_view_id") REFERENCES "saved_views"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "campaigns_audience_view_id_idx" ON "campaigns"("audience_view_id");
