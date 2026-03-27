-- CreateEnum
CREATE TYPE "TradingPartnerDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'BOTH');

-- CreateEnum
CREATE TYPE "TransactionSet" AS ENUM ('EDI_204', 'EDI_211', 'EDI_214', 'EDI_210', 'EDI_990', 'EDI_997');

-- CreateEnum
CREATE TYPE "MappingDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "AuthType" AS ENUM ('NONE', 'API_KEY', 'BEARER', 'BASIC');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('RECEIVED', 'PARSING', 'MAPPING', 'DELIVERING', 'DELIVERED', 'FAILED', 'DUPLICATE');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradingPartner" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isaId" TEXT NOT NULL,
    "direction" "TradingPartnerDirection" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradingPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SftpConnection" (
    "id" TEXT NOT NULL,
    "tradingPartnerId" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 22,
    "username" TEXT NOT NULL,
    "encryptedPassword" TEXT NOT NULL,
    "remotePath" TEXT NOT NULL,
    "archivePath" TEXT NOT NULL,
    "pollingIntervalSeconds" INTEGER NOT NULL DEFAULT 300,
    "filePattern" TEXT NOT NULL DEFAULT '*.edi',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SftpConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mapping" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "transactionSet" "TransactionSet" NOT NULL,
    "direction" "MappingDirection" NOT NULL,
    "jsonataExpression" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DownstreamApi" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "authType" "AuthType" NOT NULL DEFAULT 'NONE',
    "encryptedCredentials" TEXT,
    "headers" JSONB,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DownstreamApi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "tradingPartnerId" TEXT NOT NULL,
    "transactionSet" "TransactionSet" NOT NULL,
    "direction" "MappingDirection" NOT NULL,
    "status" "TransactionStatus" NOT NULL DEFAULT 'RECEIVED',
    "rawEdi" TEXT,
    "jediPayload" JSONB,
    "outboundPayload" JSONB,
    "downstreamStatusCode" INTEGER,
    "errorMessage" TEXT,
    "isaControlNumber" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransactionEvent" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransactionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradingPartner_orgId_idx" ON "TradingPartner"("orgId");

-- CreateIndex
CREATE INDEX "TradingPartner_isaId_idx" ON "TradingPartner"("isaId");

-- CreateIndex
CREATE INDEX "SftpConnection_tradingPartnerId_idx" ON "SftpConnection"("tradingPartnerId");

-- CreateIndex
CREATE INDEX "Mapping_orgId_idx" ON "Mapping"("orgId");

-- CreateIndex
CREATE INDEX "DownstreamApi_orgId_idx" ON "DownstreamApi"("orgId");

-- CreateIndex
CREATE INDEX "Transaction_orgId_idx" ON "Transaction"("orgId");

-- CreateIndex
CREATE INDEX "Transaction_tradingPartnerId_idx" ON "Transaction"("tradingPartnerId");

-- CreateIndex
CREATE INDEX "Transaction_contentHash_idx" ON "Transaction"("contentHash");

-- CreateIndex
CREATE INDEX "Transaction_isaControlNumber_idx" ON "Transaction"("isaControlNumber");

-- CreateIndex
CREATE INDEX "TransactionEvent_transactionId_idx" ON "TransactionEvent"("transactionId");

-- AddForeignKey
ALTER TABLE "TradingPartner" ADD CONSTRAINT "TradingPartner_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SftpConnection" ADD CONSTRAINT "SftpConnection_tradingPartnerId_fkey" FOREIGN KEY ("tradingPartnerId") REFERENCES "TradingPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mapping" ADD CONSTRAINT "Mapping_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DownstreamApi" ADD CONSTRAINT "DownstreamApi_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_tradingPartnerId_fkey" FOREIGN KEY ("tradingPartnerId") REFERENCES "TradingPartner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransactionEvent" ADD CONSTRAINT "TransactionEvent_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
