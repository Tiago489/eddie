// Stedi lookup tables — used by $lookupTable($tables.TABLE_NAME, "Key", value).Value
// These are auto-populated from Stedi mapping metadata and learned from fixture uploads.

export interface LookupEntry {
  Key: string;
  Value: string;
}

export interface LookupTableSet {
  [tableName: string]: LookupEntry[];
}

// Master table seeded from Stedi API mapping responses
const TABLES: LookupTableSet = {
  PURPOSE_CODES: [
    { Key: '00', Value: 'ORIGINAL' },
    { Key: '01', Value: 'CANCELLATION' },
    { Key: '02', Value: 'CHANGE' },
    { Key: '04', Value: 'CHANGE' },
  ],
  PAYMENT_METHOD: [
    { Key: 'PP', Value: 'PREPAID_BY_SELLER' },
    { Key: 'CC', Value: 'COLLECT' },
    { Key: 'NC', Value: 'SERVICE_FREIGHT_NO_CHARGES' },
    { Key: 'TP', Value: 'THIRD_PARTY_PAY' },
  ],
  PAYMENT_CODES: [
    { Key: 'PP', Value: 'PREPAID_BY_SELLER' },
    { Key: 'CC', Value: 'COLLECT' },
    { Key: 'NC', Value: 'SERVICE_FREIGHT_NO_CHARGES' },
    { Key: 'TP', Value: 'THIRD_PARTY_PAY' },
  ],
  PICKUP_OR_DELIVERY: [
    { Key: 'LCL', Value: 'DELIVERY' },
    { Key: 'PUD', Value: 'PICKUP_AND_DELIVERY' },
    { Key: 'PUC', Value: 'PICKUP' },
    { Key: 'DEL', Value: 'DELIVERY' },
  ],
  SERVICE_LEVEL: [
    { Key: 'DEL', Value: 'delivery' },
    { Key: 'PUC', Value: 'PICKUP' },
    { Key: 'PUD', Value: 'PICKUP_AND_DELIVERY' },
  ],
  ORDER_SERVICE_LEVEL: [
    { Key: 'RESB', Value: 'DELIVERY' },
    { Key: 'PDDT', Value: 'PICKUP' },
    { Key: 'NSR', Value: 'DELIVERY' },
  ],
  DELIVERY_PICKUP: [
    { Key: 'CL', Value: 'DELIVERY' },
    { Key: 'CU', Value: 'PICKUP' },
    { Key: 'RT', Value: 'PICKUP' },
    { Key: 'LD', Value: 'DELIVERY' },
    { Key: 'UL', Value: 'PICKUP' },
  ],
  SHIPMENT_STATUS_CODES: [
    { Key: 'IN_TRANSIT', Value: 'X6' },
    { Key: 'PICKED_UP', Value: 'AF' },
    { Key: 'DELIVERED', Value: 'D1' },
    { Key: 'OUT_FOR_DELIVERY', Value: 'OA' },
    { Key: 'APPOINTMENT_SCHEDULED', Value: 'AA' },
    { Key: 'APPOINTMENT_MISSED', Value: 'AM' },
  ],
  CONTACT_CODES: [],
};

export function getDefaultTables(): LookupTableSet {
  return TABLES;
}

/**
 * Merge per-mapping lookup tables (from Stedi API) with the global defaults.
 * Per-mapping tables take precedence for matching keys.
 */
export function mergeTables(
  perMapping: Array<{ name: string; values: LookupEntry[] }>,
): LookupTableSet {
  const merged: LookupTableSet = {};
  for (const [name, entries] of Object.entries(TABLES)) {
    merged[name] = [...entries];
  }
  for (const table of perMapping) {
    const existing = merged[table.name] ?? [];
    const existingKeys = new Set(existing.map((e) => e.Key));
    for (const entry of table.values) {
      if (!existingKeys.has(entry.Key)) {
        existing.push(entry);
        existingKeys.add(entry.Key);
      }
    }
    merged[table.name] = existing;
  }
  return merged;
}

/**
 * Learn new lookup values by comparing Eddie's mapping output against Stedi ground truth.
 * Returns entries that should be added to the lookup tables.
 */
export function learnFromFixture(
  eddieOutput: Record<string, unknown>,
  stediOutput: Record<string, unknown>,
): Array<{ table: string; entry: LookupEntry }> {
  const learned: Array<{ table: string; entry: LookupEntry }> = [];

  // Known field → table mappings for auto-learning
  const fieldToTable: Record<string, string> = {
    transactionSetPurposeCode: 'PURPOSE_CODES',
    'order.paymentMethod': 'PAYMENT_METHOD',
    'order.pickupOrDelivery': 'PICKUP_OR_DELIVERY',
    'order.serviceLevel': 'SERVICE_LEVEL',
  };

  for (const [fieldPath, tableName] of Object.entries(fieldToTable)) {
    const parts = fieldPath.split('.');
    let eddieVal: unknown = eddieOutput;
    let stediVal: unknown = stediOutput;

    for (const part of parts) {
      eddieVal = (eddieVal as Record<string, unknown>)?.[part];
      stediVal = (stediVal as Record<string, unknown>)?.[part];
    }

    // If Eddie got undefined (lookup failed) but Stedi has a value,
    // we can't determine the Key from the output alone — skip
    // If Eddie got a raw code and Stedi got a human-readable value, learn it
    if (
      typeof eddieVal === 'string' &&
      typeof stediVal === 'string' &&
      eddieVal !== stediVal
    ) {
      const table = TABLES[tableName];
      if (table && !table.some((e) => e.Key === eddieVal)) {
        learned.push({ table: tableName, entry: { Key: eddieVal, Value: stediVal } });
      }
    }
  }

  return learned;
}

/**
 * Add learned entries to the global tables (runtime only — persists until restart).
 */
export function addEntries(entries: Array<{ table: string; entry: LookupEntry }>): void {
  for (const { table, entry } of entries) {
    if (!TABLES[table]) TABLES[table] = [];
    if (!TABLES[table].some((e) => e.Key === entry.Key)) {
      TABLES[table].push(entry);
    }
  }
}
