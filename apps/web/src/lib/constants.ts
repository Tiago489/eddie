export const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? 'default-org';

export const TRANSACTION_SETS = [
  'EDI_204', 'EDI_211', 'EDI_214',
  'EDI_210', 'EDI_990', 'EDI_997',
];

export const TRANSACTION_STATUSES = [
  'RECEIVED', 'PARSING', 'MAPPING',
  'DELIVERING', 'DELIVERED', 'FAILED', 'DUPLICATE',
];
