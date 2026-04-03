export const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? 'default-org';

export const TRANSACTION_SETS = [
  'EDI_204', 'EDI_211', 'EDI_214',
  'EDI_210', 'EDI_990', 'EDI_997',
];

export const TRANSACTION_STATUSES = [
  'RECEIVED', 'PARSING', 'MAPPING',
  'DELIVERING', 'DELIVERED', 'FAILED', 'DUPLICATE',
];

export const KNOWN_DOWNSTREAM_APIS = {
  TMS_PRODUCTION: 'https://api.ourtms.com/edi/inbound',
  TMS_STAGING:    'https://staging.api.ourtms.com/edi/inbound',
  TMS_LOCAL:      'http://localhost:4000/edi/inbound',
  CUSTOM:         'custom',
} as const;
