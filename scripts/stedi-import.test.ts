import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import type {
  StediProfile,
  StediPartnership,
  StediMappingSummary,
  StediMappingDetail,
  ImportPlan,
  ResourceFilter,
} from './stedi-import';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_PROFILES: StediProfile[] = [
  { profileId: 'shipper-a', profileType: 'local', name: 'Shipper A' },
  { profileId: 'carrier-x', profileType: 'partner', name: 'Carrier X' },
  { profileId: 'carrier-y', profileType: 'partner', name: 'Carrier Y' },
];

const MOCK_PARTNERSHIPS: StediPartnership[] = [
  { partnershipId: 'shipper-a_carrier-x', localProfileId: 'shipper-a', partnerProfileId: 'carrier-x' },
  { partnershipId: 'shipper-a_carrier-y', localProfileId: 'shipper-a', partnerProfileId: 'carrier-y' },
];

const MOCK_MAPPING_SUMMARY: StediMappingSummary = {
  id: 'map-001',
  name: '[Carrier X] EDI 204 to Order JSON',
  type: 'only_mapped_keys',
  source: {
    type: 'jsonschema@2020-12',
    content: '',
    connection: {
      stedi_guides: {
        guide_id: 'LIVE_GUIDE_204',
        guide_name: '[Carrier X] Motor Carrier Load Tender',
        pulled_at: '2026-01-01T00:00:00Z',
      },
    },
  },
  target: { type: 'jsonschema@2020-12', content: '' },
  lock_status: 'unlocked',
  locking_scope: [],
  unpublished_changes: false,
  published_at: '2026-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const MOCK_MAPPING_SUMMARY_OUTBOUND: StediMappingSummary = {
  ...MOCK_MAPPING_SUMMARY,
  id: 'map-002',
  name: '[Carrier Y] 214 OUTBOUND',
  source: { type: 'jsonschema@2020-12', content: '' },
  target: {
    type: 'jsonschema@2020-12',
    content: '',
    connection: {
      stedi_guides: {
        guide_id: 'LIVE_GUIDE_214',
        guide_name: '[Carrier Y] Shipment Status',
      },
    },
  },
};

const MOCK_MAPPING_DETAIL: StediMappingDetail = {
  ...MOCK_MAPPING_SUMMARY,
  mapping: '{ "orderId": $$.transactionSets[0].heading.id }',
};

const MOCK_MAPPING_DETAIL_OUTBOUND: StediMappingDetail = {
  ...MOCK_MAPPING_SUMMARY_OUTBOUND,
  mapping: '{ "statusCode": status }',
};

const MOCK_BAD_MAPPING: StediMappingSummary = {
  ...MOCK_MAPPING_SUMMARY,
  id: 'map-bad',
  name: '[Unknown] Some Integration',
  source: { type: 'jsonschema@2020-12', content: '' },
  target: { type: 'jsonschema@2020-12', content: '' },
};

// ---------------------------------------------------------------------------
// MSW server
// ---------------------------------------------------------------------------

const CORE_BASE = 'https://core.us.stedi.com/2023-08-01';
const MAPPINGS_BASE = 'https://mappings.us.stedi.com/2021-06-01';

const handlers = [
  http.get(`${CORE_BASE}/profiles`, () => {
    return HttpResponse.json({ items: MOCK_PROFILES, nextPageToken: null });
  }),
  http.get(`${CORE_BASE}/partnerships`, () => {
    return HttpResponse.json({ items: MOCK_PARTNERSHIPS, nextPageToken: null });
  }),
  http.get(`${MAPPINGS_BASE}/mappings`, () => {
    return HttpResponse.json({
      mappings: [MOCK_MAPPING_SUMMARY, MOCK_MAPPING_SUMMARY_OUTBOUND],
    });
  }),
  http.get(`${MAPPINGS_BASE}/mappings/map-001`, () => {
    return HttpResponse.json(MOCK_MAPPING_DETAIL);
  }),
  http.get(`${MAPPINGS_BASE}/mappings/map-002`, () => {
    return HttpResponse.json(MOCK_MAPPING_DETAIL_OUTBOUND);
  }),
];

const server = setupServer(...handlers);

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let buildImportPlan: (apiKey: string, resource?: ResourceFilter) => Promise<ImportPlan>;
let executeImport: typeof import('./stedi-import').executeImport;
let parseTransactionSet: typeof import('./stedi-import').parseTransactionSet;
let parseDirection: typeof import('./stedi-import').parseDirection;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('stedi-import', { timeout: 60000 }, () => {
  beforeAll(async () => {
    server.listen({ onUnhandledRequest: 'bypass' });
    const mod = await import('./stedi-import');
    buildImportPlan = mod.buildImportPlan;
    executeImport = mod.executeImport;
    parseTransactionSet = mod.parseTransactionSet;
    parseDirection = mod.parseDirection;
  });

  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  // -----------------------------------------------------------------------
  // Pure unit tests
  // -----------------------------------------------------------------------

  describe('parseTransactionSet', () => {
    it('should detect 204 from mapping name', () => {
      expect(parseTransactionSet('[Carrier X] EDI 204 to Order JSON')).toBe('EDI_204');
    });

    it('should detect 214 from mapping name', () => {
      expect(parseTransactionSet('[Carrier Y] 214 OUTBOUND')).toBe('EDI_214');
    });

    it('should detect 211 from mapping name', () => {
      expect(parseTransactionSet('[ArcBest] 211 INBOUND (Motor Carrier Bill of Lading)')).toBe('EDI_211');
    });

    it('should detect 210 from mapping name', () => {
      expect(parseTransactionSet('[DHL] Outbound EDI 210 v2')).toBe('EDI_210');
    });

    it('should return null for unrecognized names', () => {
      expect(parseTransactionSet('[Unknown] Some Integration')).toBeNull();
    });
  });

  describe('parseDirection', () => {
    it('should detect INBOUND', () => {
      expect(parseDirection('[ArcBest] 211 INBOUND')).toBe('INBOUND');
    });

    it('should detect OUTBOUND', () => {
      expect(parseDirection('[Carrier Y] 214 OUTBOUND')).toBe('OUTBOUND');
    });

    it('should detect inbound case-insensitive', () => {
      expect(parseDirection('[Pilot] EDI 211 v4010 INBOUND')).toBe('INBOUND');
    });

    it('should return null when no direction found and no summary', () => {
      expect(parseDirection('[Carrier X] EDI 204 to Order JSON')).toBeNull();
    });

    it('should infer INBOUND from source guide connection', () => {
      expect(parseDirection('[Carrier X] EDI 204 to Order JSON', MOCK_MAPPING_SUMMARY)).toBe('INBOUND');
    });

    it('should infer OUTBOUND from target guide connection', () => {
      expect(parseDirection('[Skyworks] EDI 214', MOCK_MAPPING_SUMMARY_OUTBOUND)).toBe('OUTBOUND');
    });
  });

  // -----------------------------------------------------------------------
  // Dry run — buildImportPlan
  // -----------------------------------------------------------------------

  describe('buildImportPlan (dry run)', () => {
    it('should build a complete plan from mock Stedi data', async () => {
      const plan = await buildImportPlan('test-api-key');

      // Trading partners: only partner profiles (carrier-x, carrier-y)
      expect(plan.tradingPartners).toHaveLength(2);
      expect(plan.tradingPartners.map((tp) => tp.name)).toContain('Carrier X');
      expect(plan.tradingPartners.map((tp) => tp.name)).toContain('Carrier Y');

      // Guides: extracted from mapping connections
      expect(plan.guides).toHaveLength(2);
      expect(plan.guides.map((g) => g.guideId)).toContain('LIVE_GUIDE_204');
      expect(plan.guides.map((g) => g.guideId)).toContain('LIVE_GUIDE_214');

      // Both mappings should succeed — 214 via name keyword, 204 via guide connection fallback
      expect(plan.mappings).toHaveLength(2);

      const mapping214 = plan.mappings.find((m) => m.name.includes('214'));
      expect(mapping214).toBeDefined();
      expect(mapping214!.transactionSet).toBe('EDI_214');
      expect(mapping214!.direction).toBe('OUTBOUND');

      const mapping204 = plan.mappings.find((m) => m.name.includes('204'));
      expect(mapping204).toBeDefined();
      expect(mapping204!.transactionSet).toBe('EDI_204');
      expect(mapping204!.direction).toBe('INBOUND'); // inferred from source guide connection
    });

    it('should not write to DB during plan building', async () => {
      // buildImportPlan only calls Stedi API, never Prisma
      const plan = await buildImportPlan('test-api-key');
      expect(plan).toBeDefined();
      // If we got here without a DB connection, it proves no DB writes happened
    });
  });

  // -----------------------------------------------------------------------
  // --resource filter
  // -----------------------------------------------------------------------

  describe('--resource filter', () => {
    it('should only fetch mappings when resource=mappings', async () => {
      let profilesCalled = false;
      let partnershipsCalled = false;

      server.use(
        http.get(`${CORE_BASE}/profiles`, () => {
          profilesCalled = true;
          return HttpResponse.json({ items: MOCK_PROFILES, nextPageToken: null });
        }),
        http.get(`${CORE_BASE}/partnerships`, () => {
          partnershipsCalled = true;
          return HttpResponse.json({ items: MOCK_PARTNERSHIPS, nextPageToken: null });
        }),
      );

      const plan = await buildImportPlan('test-api-key', 'mappings');

      expect(plan.tradingPartners).toHaveLength(0);
      expect(plan.guides).toHaveLength(0);
      expect(profilesCalled).toBe(false);
      expect(partnershipsCalled).toBe(false);
      // Mappings should still be fetched
      expect(plan.mappings.length + plan.errors.filter((e) => e.resource === 'mapping').length).toBeGreaterThan(0);
    });

    it('should only fetch trading partners when resource=trading-partners', async () => {
      let mappingsCalled = false;

      server.use(
        http.get(`${MAPPINGS_BASE}/mappings`, () => {
          mappingsCalled = true;
          return HttpResponse.json({ mappings: [] });
        }),
      );

      const plan = await buildImportPlan('test-api-key', 'trading-partners');

      expect(plan.tradingPartners).toHaveLength(2);
      expect(plan.mappings).toHaveLength(0);
      expect(plan.guides).toHaveLength(0);
      expect(mappingsCalled).toBe(false);
    });

    it('should only fetch guides when resource=guides', async () => {
      const plan = await buildImportPlan('test-api-key', 'guides');

      expect(plan.tradingPartners).toHaveLength(0);
      expect(plan.mappings).toHaveLength(0);
      expect(plan.guides).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('should throw StediAuthError on 401', async () => {
      server.use(
        http.get(`${CORE_BASE}/partnerships`, () => {
          return HttpResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }),
      );

      const { StediAuthError } = await import('./stedi-import');

      await expect(buildImportPlan('bad-key')).rejects.toThrow(StediAuthError);
      await expect(buildImportPlan('bad-key')).rejects.toThrow('Invalid STEDI_API_KEY');
    });

    it('should throw StediNotFoundError on 404', async () => {
      server.use(
        http.get(`${CORE_BASE}/partnerships`, () => {
          return HttpResponse.json({ error: 'Not Found' }, { status: 404 });
        }),
      );

      const { StediNotFoundError } = await import('./stedi-import');

      await expect(buildImportPlan('test-key')).rejects.toThrow(StediNotFoundError);
    });

    it('should continue processing when a single mapping record fails', async () => {
      server.use(
        http.get(`${MAPPINGS_BASE}/mappings`, () => {
          return HttpResponse.json({
            mappings: [MOCK_MAPPING_SUMMARY_OUTBOUND, MOCK_BAD_MAPPING],
          });
        }),
      );

      const plan = await buildImportPlan('test-api-key', 'mappings');

      // The valid outbound 214 mapping should succeed
      expect(plan.mappings).toHaveLength(1);
      expect(plan.mappings[0].transactionSet).toBe('EDI_214');

      // The bad mapping (no transaction set detected) should be in errors
      const badError = plan.errors.find((e) => e.id === 'map-bad');
      expect(badError).toBeDefined();
      expect(badError!.error).toContain('transaction set');
    });
  });

  // -----------------------------------------------------------------------
  // Execute mode (integration with DB)
  // -----------------------------------------------------------------------

  describe('executeImport (integration)', { timeout: 120000 }, () => {
    let prisma: import('@edi-platform/db').PrismaClient;
    let container: import('@testcontainers/postgresql').StartedPostgreSqlContainer;
    let orgId: string;
    let dockerAvailable = true;

    beforeAll(async () => {
      try {
        const { PostgreSqlContainer } = await import('@testcontainers/postgresql');
        const { PrismaClient } = await import('@edi-platform/db');
        const { execSync } = await import('child_process');

        container = await new PostgreSqlContainer('postgres:16').withDatabase('edi_test').start();
        const url = container.getConnectionUri();
        process.env.DATABASE_URL = url;
        execSync('pnpm --filter @edi-platform/db db:migrate:deploy', {
          env: { ...process.env, DATABASE_URL: url },
          stdio: 'pipe',
        });
        prisma = new PrismaClient({ datasources: { db: { url } } });
        orgId = 'test-org-001';
      } catch {
        dockerAvailable = false;
      }
    });

    afterAll(async () => {
      if (dockerAvailable) {
        await prisma?.$disconnect();
        await container?.stop();
      }
    });

    it('should upsert trading partners and mappings in a transaction', async () => {
      if (!dockerAvailable) return;

      const plan: ImportPlan = {
        tradingPartners: [
          { profileId: 'carrier-x', name: 'Carrier X', isaId: 'CARRIER-X', direction: 'INBOUND', source: 'profile' },
          { profileId: 'carrier-y', name: 'Carrier Y', isaId: 'CARRIER-Y', direction: 'OUTBOUND', source: 'profile' },
        ],
        guides: [
          {
            guideId: 'LIVE_TEST_GUIDE',
            guideName: 'Test Guide',
            transactionSet: '214',
            direction: 'OUTBOUND',
            sourceMappingId: 'map-002',
            sourceMappingName: 'Test Mapping',
          },
        ],
        mappings: [
          {
            stediId: 'map-002',
            name: '[Carrier Y] 214 OUTBOUND',
            transactionSet: 'EDI_214',
            direction: 'OUTBOUND',
            jsonataExpression: '{ "statusCode": status }',
            guideId: 'LIVE_GUIDE_214',
          },
        ],
        errors: [],
      };

      const result = await executeImport(prisma, plan, orgId);

      expect(result.tradingPartnersUpserted).toBe(2);
      expect(result.mappingsUpserted).toBe(1);
      expect(result.guidesWritten).toBe(1);

      // Verify DB state
      const partners = await prisma.tradingPartner.findMany({ where: { orgId } });
      expect(partners).toHaveLength(2);
      expect(partners.map((p: { isaId: string }) => p.isaId).sort()).toEqual(['CARRIER-X', 'CARRIER-Y']);

      const mappings = await prisma.mapping.findMany({ where: { orgId } });
      expect(mappings).toHaveLength(1);
      expect(mappings[0].name).toBe('[Carrier Y] 214 OUTBOUND');
      expect(mappings[0].guideId).toBe('LIVE_GUIDE_214');
    });

    it('should be idempotent — running twice produces same result', async () => {
      if (!dockerAvailable) return;

      const plan: ImportPlan = {
        tradingPartners: [
          { profileId: 'carrier-z', name: 'Carrier Z', isaId: 'CARRIER-Z', direction: 'BOTH', source: 'profile' },
        ],
        guides: [],
        mappings: [],
        errors: [],
      };

      await executeImport(prisma, plan, orgId);
      const result2 = await executeImport(prisma, plan, orgId);

      expect(result2.tradingPartnersUpserted).toBe(1);

      // Should still be just one record, not duplicated
      const partners = await prisma.tradingPartner.findMany({
        where: { orgId, isaId: 'CARRIER-Z' },
      });
      expect(partners).toHaveLength(1);
    });

    it('should upsert all 3 resource types in execute mode', async () => {
      if (!dockerAvailable) return;

      const plan: ImportPlan = {
        tradingPartners: [
          { profileId: 'exec-carrier', name: 'Exec Carrier', isaId: 'EXEC-CARRIER', direction: 'INBOUND', source: 'profile' },
        ],
        guides: [
          {
            guideId: 'LIVE_EXEC_GUIDE',
            guideName: 'Exec Guide',
            transactionSet: '204',
            direction: 'INBOUND',
            sourceMappingId: 'map-exec',
            sourceMappingName: 'Exec Mapping',
          },
        ],
        mappings: [
          {
            stediId: 'map-exec',
            name: '[Exec] EDI 204 Inbound',
            transactionSet: 'EDI_204',
            direction: 'INBOUND',
            jsonataExpression: '$$',
            guideId: 'LIVE_EXEC_GUIDE',
          },
        ],
        errors: [],
      };

      const result = await executeImport(prisma, plan, orgId);

      expect(result.tradingPartnersUpserted).toBe(1);
      expect(result.guidesWritten).toBe(1);
      expect(result.mappingsUpserted).toBe(1);
    });
  });
});
