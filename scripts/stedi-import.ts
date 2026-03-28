// Stedi API Endpoints (discovered via live API calls):
//
// Trading Partners (profiles + partnerships):
//   GET https://core.us.stedi.com/2023-08-01/profiles          → { items: Profile[], nextPageToken? }
//   GET https://core.us.stedi.com/2023-08-01/profiles/:id      → Profile
//   GET https://core.us.stedi.com/2023-08-01/partnerships      → { items: Partnership[], nextPageToken? }
//   GET https://core.us.stedi.com/2023-08-01/partnerships/:id  → Partnership
//   Auth: Authorization: Key <STEDI_API_KEY>
//
// Mappings:
//   GET https://mappings.us.stedi.com/2021-06-01/mappings       → { mappings: MappingSummary[] }
//   GET https://mappings.us.stedi.com/2021-06-01/mappings/:id   → MappingDetail (includes .mapping JSONata string)
//   Auth: Authorization: Key <STEDI_API_KEY>
//
// Guides:
//   GET https://guides.us.stedi.com/.../guides                  → 403 Forbidden (API key lacks permission)
//   Guide metadata is extracted from mapping source/target connections instead.

try { require('dotenv/config'); } catch { /* dotenv not available in test context */ }

import { PrismaClient, type TransactionSet, type MappingDirection, type TradingPartnerDirection } from '../packages/db/src/index';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ---------------------------------------------------------------------------
// Types — Stedi API response shapes
// ---------------------------------------------------------------------------

interface StediProfile {
  profileId: string;
  profileType: 'local' | 'partner';
  name: string;
  timezone?: string;
  timeFormat?: string;
}

interface StediPartnership {
  partnershipId: string;
  localProfileId: string;
  partnerProfileId: string;
}

interface StediGuideConnection {
  guide_id: string;
  guide_name?: string;
  pulled_at?: string;
}

interface StediMappingSummary {
  id: string;
  name: string;
  type: string;
  source: {
    type: string;
    content: string;
    connection?: { stedi_guides?: StediGuideConnection };
  };
  target: {
    type: string;
    content: string;
    connection?: { stedi_guides?: StediGuideConnection };
  };
  lock_status: string;
  locking_scope: string[];
  unpublished_changes: boolean;
  published_at: string;
  created_at: string;
  updated_at: string;
}

interface StediLookupTable {
  name: string;
  values: Array<{ Key: string; Value: string }>;
}

interface StediMappingDetail extends StediMappingSummary {
  mapping: string; // JSONata expression
  lookup_tables?: StediLookupTable[];
}

// ---------------------------------------------------------------------------
// Import plan types
// ---------------------------------------------------------------------------

interface TradingPartnerPlan {
  profileId: string;
  name: string;
  isaId: string;
  direction: TradingPartnerDirection;
  source: 'profile';
}

interface GuidePlan {
  guideId: string;
  guideName: string;
  transactionSet: string;
  direction: string;
  sourceMappingId: string;
  sourceMappingName: string;
}

interface MappingPlan {
  stediId: string;
  name: string;
  transactionSet: TransactionSet;
  direction: MappingDirection;
  jsonataExpression: string;
  guideId: string | null;
  lookupTables: StediLookupTable[];
}

interface ImportPlan {
  tradingPartners: TradingPartnerPlan[];
  guides: GuidePlan[];
  mappings: MappingPlan[];
  errors: ImportError[];
}

interface ImportError {
  resource: 'trading-partner' | 'guide' | 'mapping';
  id: string;
  error: string;
}

interface ImportResult {
  tradingPartnersUpserted: number;
  guidesWritten: number;
  mappingsUpserted: number;
  errors: ImportError[];
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const CORE_BASE = 'https://core.us.stedi.com/2023-08-01';
const MAPPINGS_BASE = 'https://mappings.us.stedi.com/2021-06-01';
const REQUEST_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function stediFetch<T>(url: string, apiKey: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { Authorization: `Key ${apiKey}` },
      signal: controller.signal,
    });

    if (res.status === 401) {
      throw new StediAuthError('Invalid STEDI_API_KEY — check your .env file');
    }
    if (res.status === 404) {
      throw new StediNotFoundError(`404 Not Found: ${url} — check Stedi docs for the correct endpoint`);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Stedi API error ${res.status} for ${url}: ${body}`);
    }

    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

class StediAuthError extends Error {
  constructor(message: string) { super(message); this.name = 'StediAuthError'; }
}

class StediNotFoundError extends Error {
  constructor(message: string) { super(message); this.name = 'StediNotFoundError'; }
}

// ---------------------------------------------------------------------------
// Paginated fetch for Core API
// ---------------------------------------------------------------------------

async function fetchAllPages<T>(baseUrl: string, apiKey: string, label: string): Promise<T[]> {
  const all: T[] = [];
  let nextPageToken: string | undefined;
  let page = 0;

  do {
    page++;
    process.stdout.write(`\rFetching ${label}... (page ${page}, ${all.length} records)`);

    const url = nextPageToken
      ? `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}pageSize=100&nextPageToken=${encodeURIComponent(nextPageToken)}`
      : `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}pageSize=100`;

    const data = await stediFetch<{ items: T[]; nextPageToken?: string }>(url, apiKey);
    all.push(...data.items);
    nextPageToken = data.nextPageToken ?? undefined;
  } while (nextPageToken);

  console.log(`\rFetching ${label}... done (${all.length} records)`);
  return all;
}

// ---------------------------------------------------------------------------
// Transaction set detection from mapping name
// ---------------------------------------------------------------------------

const TRANSACTION_SET_MAP: Record<string, TransactionSet> = {
  '204': 'EDI_204',
  '210': 'EDI_210',
  '211': 'EDI_211',
  '214': 'EDI_214',
  '990': 'EDI_990',
  '997': 'EDI_997',
};

function parseTransactionSet(name: string): TransactionSet | null {
  // Match patterns like "EDI 204", "204 Inbound", "211 -", "210 v2"
  const match = name.match(/\b(204|210|211|214|990|997)\b/);
  if (!match) return null;
  return TRANSACTION_SET_MAP[match[1]] ?? null;
}

function parseDirection(name: string, summary?: StediMappingSummary): MappingDirection | null {
  const lower = name.toLowerCase();
  if (lower.includes('inbound')) return 'INBOUND';
  if (lower.includes('outbound')) return 'OUTBOUND';

  // Fallback: infer from guide connection position.
  // source guide → mapping reads EDI → INBOUND
  // target guide → mapping writes EDI → OUTBOUND
  if (summary) {
    const hasSourceGuide = !!summary.source.connection?.stedi_guides?.guide_id;
    const hasTargetGuide = !!summary.target.connection?.stedi_guides?.guide_id;
    if (hasSourceGuide && !hasTargetGuide) return 'INBOUND';
    if (hasTargetGuide && !hasSourceGuide) return 'OUTBOUND';
  }

  return null;
}

function parseTradingPartnerDirection(
  profileId: string,
  partnerships: StediPartnership[],
): TradingPartnerDirection {
  let isLocal = false;
  let isPartner = false;

  for (const p of partnerships) {
    if (p.localProfileId === profileId) isLocal = true;
    if (p.partnerProfileId === profileId) isPartner = true;
  }

  if (isLocal && isPartner) return 'BOTH';
  if (isLocal) return 'OUTBOUND'; // local sends outbound
  return 'INBOUND'; // partner receives inbound
}

// ---------------------------------------------------------------------------
// Fetch functions
// ---------------------------------------------------------------------------

async function fetchProfiles(apiKey: string): Promise<StediProfile[]> {
  return fetchAllPages<StediProfile>(`${CORE_BASE}/profiles`, apiKey, 'profiles');
}

async function fetchPartnerships(apiKey: string): Promise<StediPartnership[]> {
  return fetchAllPages<StediPartnership>(`${CORE_BASE}/partnerships`, apiKey, 'partnerships');
}

async function fetchMappingSummaries(apiKey: string): Promise<StediMappingSummary[]> {
  // Mappings API uses snake_case pagination: next_page_token / page_token / page_size
  const all: StediMappingSummary[] = [];
  let pageToken: string | undefined;
  let page = 0;

  do {
    page++;
    process.stdout.write(`\rFetching mappings... (page ${page}, ${all.length} records)`);

    const params = new URLSearchParams({ page_size: '100' });
    if (pageToken) params.set('page_token', pageToken);

    const data = await stediFetch<{ mappings: StediMappingSummary[]; next_page_token?: string }>(
      `${MAPPINGS_BASE}/mappings?${params}`,
      apiKey,
    );
    all.push(...data.mappings);
    pageToken = data.next_page_token ?? undefined;
  } while (pageToken);

  console.log(`\rFetching mappings... done (${all.length} mappings, ${page} pages)`);
  return all;
}

async function fetchMappingDetail(apiKey: string, mappingId: string): Promise<StediMappingDetail> {
  return stediFetch<StediMappingDetail>(`${MAPPINGS_BASE}/mappings/${mappingId}`, apiKey);
}

// ---------------------------------------------------------------------------
// Build import plan
// ---------------------------------------------------------------------------

type ResourceFilter = 'trading-partners' | 'guides' | 'mappings';

async function buildImportPlan(
  apiKey: string,
  resourceFilter?: ResourceFilter,
): Promise<ImportPlan> {
  const plan: ImportPlan = {
    tradingPartners: [],
    guides: [],
    mappings: [],
    errors: [],
  };

  // --- Trading Partners ---
  if (!resourceFilter || resourceFilter === 'trading-partners') {
    const partnerships = await fetchPartnerships(apiKey);
    const profiles = await fetchProfiles(apiKey);

    for (const profile of profiles) {
      if (profile.profileType !== 'partner') continue;

      try {
        const direction = parseTradingPartnerDirection(profile.profileId, partnerships);
        plan.tradingPartners.push({
          profileId: profile.profileId,
          name: profile.name,
          isaId: profile.profileId.toUpperCase(),
          direction,
          source: 'profile',
        });
      } catch (err) {
        plan.errors.push({
          resource: 'trading-partner',
          id: profile.profileId,
          error: (err as Error).message,
        });
      }
    }
  }

  // --- Mappings & Guides (guides extracted from mapping metadata) ---
  if (!resourceFilter || resourceFilter === 'mappings' || resourceFilter === 'guides') {
    const summaries = await fetchMappingSummaries(apiKey);
    const seenGuides = new Set<string>();

    for (let i = 0; i < summaries.length; i++) {
      const summary = summaries[i];
      try {
        // Extract guide info from source or target connection
        const guideConnections: Array<{ conn: StediGuideConnection; direction: string }> = [];
        if (summary.source.connection?.stedi_guides) {
          guideConnections.push({
            conn: summary.source.connection.stedi_guides,
            direction: 'source',
          });
        }
        if (summary.target.connection?.stedi_guides) {
          guideConnections.push({
            conn: summary.target.connection.stedi_guides,
            direction: 'target',
          });
        }

        const txSet = parseTransactionSet(summary.name);
        const dir = parseDirection(summary.name, summary);

        // Collect guides (if not filtered to mappings-only)
        if (!resourceFilter || resourceFilter === 'guides') {
          for (const { conn } of guideConnections) {
            if (!seenGuides.has(conn.guide_id)) {
              seenGuides.add(conn.guide_id);
              plan.guides.push({
                guideId: conn.guide_id,
                guideName: conn.guide_name ?? conn.guide_id,
                transactionSet: txSet ? txSet.replace('EDI_', '') : 'unknown',
                direction: dir ?? 'unknown',
                sourceMappingId: summary.id,
                sourceMappingName: summary.name,
              });
            }
          }
        }

        // Build mapping plan (if not filtered to guides-only or trading-partners-only)
        if (!resourceFilter || resourceFilter === 'mappings') {
          if (!txSet) {
            plan.errors.push({
              resource: 'mapping',
              id: summary.id,
              error: `Could not detect transaction set from name: "${summary.name}"`,
            });
            continue;
          }

          if (!dir) {
            plan.errors.push({
              resource: 'mapping',
              id: summary.id,
              error: `Could not detect direction from name: "${summary.name}"`,
            });
            continue;
          }

          // Fetch full mapping detail for JSONata expression
          process.stdout.write(`\rFetching mapping details... (${i + 1}/${summaries.length})`);
          const detail = await fetchMappingDetail(apiKey, summary.id);

          const guideId =
            summary.source.connection?.stedi_guides?.guide_id ??
            summary.target.connection?.stedi_guides?.guide_id ??
            null;

          plan.mappings.push({
            stediId: summary.id,
            name: summary.name,
            transactionSet: txSet,
            direction: dir,
            jsonataExpression: detail.mapping,
            guideId,
            lookupTables: detail.lookup_tables ?? [],
          });
        }
      } catch (err) {
        plan.errors.push({
          resource: 'mapping',
          id: summary.id,
          error: (err as Error).message,
        });
      }
    }
    if (plan.mappings.length > 0) {
      console.log(`\rFetching mapping details... done (${plan.mappings.length} mappings)`);
    }
  }

  return plan;
}

// ---------------------------------------------------------------------------
// Execute import
// ---------------------------------------------------------------------------

async function executeImport(
  prisma: PrismaClient,
  plan: ImportPlan,
  orgId: string,
): Promise<ImportResult> {
  const result: ImportResult = {
    tradingPartnersUpserted: 0,
    guidesWritten: 0,
    mappingsUpserted: 0,
    errors: [...plan.errors],
  };

  await prisma.$transaction(async (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => {
    // Ensure org exists
    await tx.organization.upsert({
      where: { id: orgId },
      create: { id: orgId, name: 'Imported Organization' },
      update: {},
    });

    // Upsert trading partners
    for (const tp of plan.tradingPartners) {
      const existing = await tx.tradingPartner.findFirst({
        where: { isaId: tp.isaId, orgId },
      });

      if (existing) {
        await tx.tradingPartner.update({
          where: { id: existing.id },
          data: {
            name: tp.name,
            direction: tp.direction,
          },
        });
      } else {
        await tx.tradingPartner.create({
          data: {
            orgId,
            name: tp.name,
            isaId: tp.isaId,
            direction: tp.direction,
          },
        });
      }
      result.tradingPartnersUpserted++;
    }

    // Upsert mappings
    for (const m of plan.mappings) {
      const existing = await tx.mapping.findFirst({
        where: {
          orgId,
          name: m.name,
          transactionSet: m.transactionSet,
          direction: m.direction,
        },
      });

      if (existing) {
        await tx.mapping.update({
          where: { id: existing.id },
          data: {
            jsonataExpression: m.jsonataExpression,
            guideId: m.guideId,
          },
        });
      } else {
        await tx.mapping.create({
          data: {
            orgId,
            name: m.name,
            transactionSet: m.transactionSet,
            direction: m.direction,
            jsonataExpression: m.jsonataExpression,
            guideId: m.guideId,
          },
        });
      }
      result.mappingsUpserted++;
    }
  });

  // Write guide JSON files (outside transaction — filesystem, not DB)
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const guidesDir = path.resolve(scriptDir, '..', 'packages', 'edi-core', 'src', 'guides');
  await fs.mkdir(guidesDir, { recursive: true });

  for (const g of plan.guides) {
    try {
      const filePath = path.join(guidesDir, `${g.guideId}.json`);
      const guideData = {
        guideId: g.guideId,
        name: g.guideName,
        transactionSet: g.transactionSet,
        direction: g.direction,
        sourceMappingId: g.sourceMappingId,
        sourceMappingName: g.sourceMappingName,
      };
      await fs.writeFile(filePath, JSON.stringify(guideData, null, 2) + '\n');
      result.guidesWritten++;
    } catch (err) {
      result.errors.push({
        resource: 'guide',
        id: g.guideId,
        error: (err as Error).message,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Report formatting
// ---------------------------------------------------------------------------

function printPlan(plan: ImportPlan): void {
  console.log('Stedi Import Plan');
  console.log('=================\n');

  console.log(`Trading Partners: ${plan.tradingPartners.length}`);
  for (const tp of plan.tradingPartners) {
    console.log(`  [UPSERT] ${tp.name} (ISA: ${tp.isaId}, ${tp.direction})`);
  }

  console.log(`\nGuides: ${plan.guides.length}`);
  for (const g of plan.guides) {
    console.log(`  [WRITE] ${g.guideId} — ${g.guideName} (${g.transactionSet} ${g.direction})`);
  }

  console.log(`\nMappings: ${plan.mappings.length}`);
  for (const m of plan.mappings) {
    console.log(`  [UPSERT] ${m.name} (${m.transactionSet} ${m.direction}, guide: ${m.guideId ?? 'none'})`);
  }

  if (plan.errors.length > 0) {
    console.log(`\nErrors: ${plan.errors.length}`);
    for (const e of plan.errors) {
      console.log(`  [ERROR] ${e.resource} ${e.id}: ${e.error}`);
    }
  }
}

function printResult(result: ImportResult): void {
  console.log('\nImport Complete');
  console.log('===============');
  console.log(`${result.tradingPartnersUpserted} trading partners, ${result.guidesWritten} guides, ${result.mappingsUpserted} mappings imported`);
  if (result.errors.length > 0) {
    console.log(`${result.errors.length} errors encountered:`);
    for (const e of result.errors) {
      console.log(`  [ERROR] ${e.resource} ${e.id}: ${e.error}`);
    }
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const resourceArg = args.find((a: string) => a.startsWith('--resource='));
  const resourceFilter = resourceArg?.split('=')[1] as ResourceFilter | undefined;

  if (resourceFilter && !['trading-partners', 'guides', 'mappings'].includes(resourceFilter)) {
    console.error(`Invalid --resource value: ${resourceFilter}. Must be one of: trading-partners, guides, mappings`);
    process.exit(1);
  }

  const apiKey = process.env.STEDI_API_KEY;
  if (!apiKey) {
    console.error('STEDI_API_KEY not set — check your .env file');
    process.exit(1);
  }

  const orgId = process.env.DEFAULT_ORG_ID ?? 'seed-org-001';

  try {
    const plan = await buildImportPlan(apiKey, resourceFilter);
    printPlan(plan);

    if (!isExecute) {
      console.log('\nDry run — no changes made. Pass --execute to apply.');
      process.exit(0);
    }

    const prisma = new PrismaClient();
    try {
      const result = await executeImport(prisma, plan, orgId);
      printResult(result);
    } finally {
      await prisma.$disconnect();
    }
  } catch (err) {
    if (err instanceof StediAuthError) {
      console.error(err.message);
      process.exit(1);
    }
    if (err instanceof StediNotFoundError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Exports for testing
// ---------------------------------------------------------------------------

export {
  buildImportPlan,
  executeImport,
  printPlan,
  printResult,
  stediFetch,
  fetchProfiles,
  fetchPartnerships,
  fetchMappingSummaries,
  fetchMappingDetail,
  parseTransactionSet,
  parseDirection,
  StediAuthError,
  StediNotFoundError,
  CORE_BASE,
  MAPPINGS_BASE,
};

export type {
  StediProfile,
  StediPartnership,
  StediMappingSummary,
  StediMappingDetail,
  StediGuideConnection,
  ImportPlan,
  ImportResult,
  ImportError,
  TradingPartnerPlan,
  GuidePlan,
  MappingPlan,
  ResourceFilter,
};

// Only run main() when executed directly, not when imported by tests
const isDirectRun = process.argv[1]?.includes('stedi-import') && !process.argv[1]?.includes('vitest');
if (isDirectRun) {
  main().catch((e) => {
    console.error('Import failed:', e);
    process.exit(1);
  });
}
