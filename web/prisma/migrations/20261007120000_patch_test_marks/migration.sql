-- /patchnotes manual-test marks. New table only; nothing reads it until this
-- PR's code ships. Rollback: DROP TABLE "patch_test_marks";
CREATE TABLE "patch_test_marks" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "repo" TEXT NOT NULL,
    "pr_number" INTEGER NOT NULL,
    "step_index" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patch_test_marks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "patch_test_marks_state" CHECK ("state" IN ('ok', 'bug'))
);

CREATE UNIQUE INDEX "patch_test_marks_user_step_key" ON "patch_test_marks"("tenant_id", "user_id", "repo", "pr_number", "step_index");

ALTER TABLE "patch_test_marks" ADD CONSTRAINT "patch_test_marks_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "patch_test_marks" ADD CONSTRAINT "patch_test_marks_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
