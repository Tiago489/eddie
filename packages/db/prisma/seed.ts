import 'dotenv/config'
import { PrismaClient } from '@prisma/client';
import { createHash, randomBytes, createCipheriv } from 'crypto';

const prisma = new PrismaClient();

const DEV_KEY = process.env.ENCRYPTION_KEY ?? '0'.repeat(64);

function encryptForSeed(text: string): string {
  const key = Buffer.from(DEV_KEY, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

async function main() {
  console.log('Seeding database...');

  const org = await prisma.organization.upsert({
    where: { id: 'seed-org-001' },
    update: {},
    create: {
      id: 'seed-org-001',
      name: 'My Company',
    },
  });
  console.log(`  Organization: ${org.name} (${org.id})`);

  const partner = await prisma.tradingPartner.upsert({
    where: { id: 'seed-partner-001' },
    update: {},
    create: {
      id: 'seed-partner-001',
      orgId: org.id,
      name: 'ACME Carrier',
      isaId: 'ACMECARRIER01',
      direction: 'BOTH',
      isActive: true,
    },
  });
  console.log(`  Trading Partner: ${partner.name}`);

  const sftpConn = await prisma.sftpConnection.upsert({
    where: { id: 'seed-sftp-001' },
    update: {},
    create: {
      id: 'seed-sftp-001',
      tradingPartnerId: partner.id,
      host: 'localhost',
      port: 2222,
      username: 'ediuser',
      encryptedPassword: encryptForSeed('edipassword'),
      remotePath: '/inbound',
      archivePath: '/archive',
      pollingIntervalSeconds: 300,
      filePattern: '*.edi',
      isActive: true,
    },
  });
  console.log(`  SFTP Connection: ${sftpConn.host}:${sftpConn.port}`);

  const mapping204 = await prisma.mapping.upsert({
    where: { id: 'seed-mapping-204' },
    update: {},
    create: {
      id: 'seed-mapping-204',
      orgId: org.id,
      name: 'EDI 204 -> TMS (Identity)',
      transactionSet: 'EDI_204',
      direction: 'INBOUND',
      jsonataExpression: '$$',
      version: 1,
      isActive: true,
    },
  });
  console.log(`  Mapping: ${mapping204.name}`);

  const mapping990 = await prisma.mapping.upsert({
    where: { id: 'seed-mapping-990' },
    update: {},
    create: {
      id: 'seed-mapping-990',
      orgId: org.id,
      name: 'TMS -> EDI 990 (Identity)',
      transactionSet: 'EDI_990',
      direction: 'OUTBOUND',
      jsonataExpression: '$$',
      version: 1,
      isActive: true,
    },
  });
  console.log(`  Mapping: ${mapping990.name}`);

  const downstreamApi = await prisma.downstreamApi.upsert({
    where: { id: 'seed-api-001' },
    update: {},
    create: {
      id: 'seed-api-001',
      orgId: org.id,
      name: 'TMS API (Dev)',
      baseUrl: 'http://localhost:4000/edi',
      authType: 'NONE',
      encryptedCredentials: null,
      headers: {},
      timeoutMs: 5000,
    },
  });
  console.log(`  Downstream API: ${downstreamApi.name}`);

  const sampleStatuses = ['DELIVERED', 'DELIVERED', 'DELIVERED', 'FAILED', 'DUPLICATE'] as const;

  for (let i = 0; i < sampleStatuses.length; i++) {
    const status = sampleStatuses[i];
    const controlNum = String(i + 1).padStart(9, '0');
    await prisma.transaction.upsert({
      where: { id: `seed-tx-00${i + 1}` },
      update: {},
      create: {
        id: `seed-tx-00${i + 1}`,
        orgId: org.id,
        tradingPartnerId: partner.id,
        transactionSet: 'EDI_204',
        direction: 'INBOUND',
        status,
        isaControlNumber: controlNum,
        contentHash: createHash('sha256').update(`sample-${i}`).digest('hex'),
        rawEdi: `ISA*00*          *00*          *ZZ*SHIPPER        *ZZ*CARRIER        *230101*1200*^*00501*${controlNum}*0*P*>~`,
        jediPayload: { sample: true, index: i },
        outboundPayload: { delivered: status === 'DELIVERED' },
        downstreamStatusCode: status === 'DELIVERED' ? 200 : status === 'FAILED' ? 500 : null,
        errorMessage: status === 'FAILED' ? 'Downstream returned 500' : null,
      },
    });
  }
  console.log(`  Sample transactions: ${sampleStatuses.length}`);

  console.log('\nSeed complete!');
  console.log('---');
  console.log(`Org ID: ${org.id}`);
  console.log(`Set NEXT_PUBLIC_ORG_ID=${org.id} in apps/web/.env.local`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
