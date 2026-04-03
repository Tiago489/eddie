export interface TradingPartner {
  id: string;
  orgId: string;
  name: string;
  isaId: string;
  gsId: string;
  direction: 'INBOUND' | 'OUTBOUND' | 'BOTH';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SftpConnection {
  id: string;
  tradingPartnerId: string;
  scac: string;
  host: string;
  port: number;
  username: string;
  remotePath: string;
  outboundRemotePath: string | null;
  archivePath: string;
  pollingIntervalSeconds: number;
  filePattern: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Mapping {
  id: string;
  orgId: string;
  name: string;
  transactionSet: string;
  direction: 'INBOUND' | 'OUTBOUND';
  jsonataExpression: string;
  guideId: string | null;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MappingTestResult {
  success: boolean;
  output?: unknown;
  error?: string;
}

export interface DownstreamApi {
  id: string;
  orgId: string;
  name: string;
  baseUrl: string;
  authType: 'NONE' | 'API_KEY' | 'BEARER' | 'BASIC';
  isDefault: boolean;
  headers?: Record<string, string>;
  timeoutMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  orgId: string;
  tradingPartnerId: string;
  transactionSet: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: string;
  rawEdi?: string;
  jediPayload?: unknown;
  outboundPayload?: unknown;
  downstreamStatusCode?: number;
  errorMessage?: string;
  isaControlNumber: string;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionParams {
  orgId: string;
  page: string;
  limit: string;
  status?: string;
  tradingPartnerId?: string;
}

export interface FixtureInfo {
  name: string;
  source: 'stedi' | 'generated';
  inputEdiPreview: string;
  lastTestedAt: string;
  lastTestPassed: boolean;
}

export interface FixtureUploadResult {
  success: boolean;
  fixture?: string;
  source?: 'stedi' | 'generated';
  testResult?: { pass: boolean; durationMs?: number; errors?: string[] };
  warnings?: string[];
  error?: string;
  code?: string;
  expression?: string;
}

export interface TransactionPage {
  data: Transaction[];
  total: number;
  page: number;
  limit: number;
}
