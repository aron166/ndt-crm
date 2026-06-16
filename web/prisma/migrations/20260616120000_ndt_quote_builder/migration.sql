
-- CreateTable
CREATE TABLE "quotes" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "company_id" INTEGER NOT NULL,
    "person_id" INTEGER,
    "lead_id" INTEGER,
    "deal_id" INTEGER,
    "quote_number" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "currency" TEXT NOT NULL DEFAULT 'HUF',
    "vat_rate" DECIMAL(65,30) NOT NULL DEFAULT 27,
    "net_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vat_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "gross_amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "valid_until" TIMESTAMP(3),
    "notes" TEXT,
    "sent_at" TIMESTAMP(3),
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_line_items" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "quote_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "cost_code" TEXT,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(65,30),
    "unit" TEXT,
    "unit_rate" DECIMAL(65,30),
    "amount" DECIMAL(65,30) DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_line_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "quotes_tenant_id_status_idx" ON "quotes"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_tenant_id_quote_number_key" ON "quotes"("tenant_id", "quote_number");

-- CreateIndex
CREATE INDEX "quote_line_items_quote_id_position_idx" ON "quote_line_items"("quote_id", "position");

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

