-- Item 4 (custom follow-up sequences): a step's condition may be "replied" (the member answered an
-- earlier e-mail; the call step for repliers). Widens one CHECK; no data change.
-- Rollback (only when no step uses it):
--   UPDATE "campaign_steps" SET "audience_rule" = 'all' WHERE "audience_rule" = 'replied';
--   ALTER TABLE "campaign_steps" DROP CONSTRAINT "campaign_steps_audience_rule_check",
--     ADD CONSTRAINT "campaign_steps_audience_rule_check" CHECK ("audience_rule" IN ('all', 'no_reply', 'no_answer'));
ALTER TABLE "campaign_steps" DROP CONSTRAINT "campaign_steps_audience_rule_check",
    ADD CONSTRAINT "campaign_steps_audience_rule_check" CHECK ("audience_rule" IN ('all', 'no_reply', 'replied', 'no_answer'));
