export const KNOWN_DOWNSTREAM_APIS = {
  TMS_PRODUCTION: 'https://api.ourtms.com/edi/inbound',
  TMS_STAGING:    'https://staging.api.ourtms.com/edi/inbound',
  TMS_LOCAL:      'http://localhost:4000/edi/inbound',
  CUSTOM:         'custom',
} as const;
