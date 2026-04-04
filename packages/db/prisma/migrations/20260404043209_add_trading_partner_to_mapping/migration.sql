-- AlterTable
ALTER TABLE "Mapping" ADD COLUMN     "tradingPartnerId" TEXT;

-- CreateIndex
CREATE INDEX "Mapping_tradingPartnerId_idx" ON "Mapping"("tradingPartnerId");

-- AddForeignKey
ALTER TABLE "Mapping" ADD CONSTRAINT "Mapping_tradingPartnerId_fkey" FOREIGN KEY ("tradingPartnerId") REFERENCES "TradingPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;
