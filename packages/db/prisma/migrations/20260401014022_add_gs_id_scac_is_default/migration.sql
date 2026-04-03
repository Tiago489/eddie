-- AlterTable
ALTER TABLE "DownstreamApi" ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "SftpConnection" ADD COLUMN     "scac" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "TradingPartner" ADD COLUMN     "gsId" TEXT NOT NULL DEFAULT '';
