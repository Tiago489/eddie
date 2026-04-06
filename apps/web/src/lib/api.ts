import type {
  TradingPartner, SftpConnection, Mapping, MappingTestResult,
  DownstreamApi, Transaction, TransactionParams, TransactionPage,
  FixtureInfo, FixtureUploadResult,
} from './types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message ?? err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getTradingPartners: (orgId: string) =>
    apiFetch<{ data: TradingPartner[] }>(`/api/trading-partners?orgId=${orgId}`),
  createTradingPartner: (body: unknown) =>
    apiFetch<TradingPartner>('/api/trading-partners', { method: 'POST', body: JSON.stringify(body) }),
  updateTradingPartner: (id: string, body: unknown) =>
    apiFetch<TradingPartner>(`/api/trading-partners/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteTradingPartner: (id: string) =>
    apiFetch(`/api/trading-partners/${id}`, { method: 'DELETE' }),

  patchTradingPartner: (id: string, body: unknown) =>
    apiFetch<TradingPartner>(`/api/trading-partners/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  assignMappings: (tradingPartnerId: string, mappingIds: string[]) =>
    apiFetch<{ updated: number }>(`/api/trading-partners/${tradingPartnerId}/mappings`, { method: 'POST', body: JSON.stringify({ mappingIds }) }),

  getSftpConnections: (orgId: string) =>
    apiFetch<{ data: SftpConnection[] }>(`/api/sftp-connections?orgId=${orgId}`),
  createSftpConnection: (body: unknown) =>
    apiFetch<SftpConnection>('/api/sftp-connections', { method: 'POST', body: JSON.stringify(body) }),
  updateSftpConnection: (id: string, body: unknown) =>
    apiFetch<SftpConnection>(`/api/sftp-connections/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteSftpConnection: (id: string) =>
    apiFetch(`/api/sftp-connections/${id}`, { method: 'DELETE' }),
  testSftpConnection: (body: { host: string; port: number; username: string; password: string }) =>
    apiFetch<{ success: boolean; message: string }>('/api/sftp-connections/test', { method: 'POST', body: JSON.stringify(body) }),

  getMappings: (orgId: string, showAll = false) =>
    apiFetch<{ data: Mapping[] }>(`/api/mappings?orgId=${orgId}${showAll ? '&showAll=true' : ''}`),
  getMapping: (id: string) =>
    apiFetch<Mapping>(`/api/mappings/${id}`),
  createMapping: (body: unknown) =>
    apiFetch<Mapping>('/api/mappings', { method: 'POST', body: JSON.stringify(body) }),
  updateMapping: (id: string, body: Partial<Pick<Mapping, 'name' | 'isActive'>>) =>
    apiFetch<Mapping>(`/api/mappings/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  testMapping: (id: string, input: unknown) =>
    apiFetch<MappingTestResult>(`/api/mappings/${id}/test`, { method: 'POST', body: JSON.stringify({ input }) }),

  getFixtures: (mappingId: string) =>
    apiFetch<{ fixtures: FixtureInfo[] }>(`/api/mappings/${mappingId}/fixtures`),
  uploadFixture: async (mappingId: string, files: File[]): Promise<FixtureUploadResult> => {
    const formData = new FormData();
    for (const file of files) {
      formData.append('file', file);
    }
    const res = await fetch(BASE + `/api/mappings/${mappingId}/fixtures`, {
      method: 'POST',
      body: formData,
    });
    return res.json();
  },
  deleteFixture: (mappingId: string, fixtureName: string) =>
    apiFetch<{ success: boolean }>(`/api/mappings/${mappingId}/fixtures/${fixtureName}`, { method: 'DELETE' }),

  getDownstreamApis: (orgId: string) =>
    apiFetch<{ data: DownstreamApi[] }>(`/api/downstream-apis?orgId=${orgId}`),
  getDefaultDownstreamApi: () =>
    apiFetch<{ data: DownstreamApi | null }>('/api/downstream-apis?default=true'),
  setDefaultDownstreamApi: (id: string) =>
    apiFetch<DownstreamApi>(`/api/downstream-apis/${id}/set-default`, { method: 'PATCH' }),
  createDownstreamApi: (body: unknown) =>
    apiFetch<DownstreamApi>('/api/downstream-apis', { method: 'POST', body: JSON.stringify(body) }),
  updateDownstreamApi: (id: string, body: unknown) =>
    apiFetch<DownstreamApi>(`/api/downstream-apis/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteDownstreamApi: (id: string) =>
    apiFetch(`/api/downstream-apis/${id}`, { method: 'DELETE' }),

  getTransactions: (params: TransactionParams) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
    return apiFetch<TransactionPage>(`/api/transactions?${q}`);
  },
  getTransaction: (id: string) =>
    apiFetch<Transaction>(`/api/transactions/${id}`),
  reprocessTransaction: (id: string) =>
    apiFetch(`/api/transactions/${id}/reprocess`, { method: 'POST' }),

  // Wizard
  wizardParse: (rawEdi: string, orgId: string) =>
    apiFetch<{ success: boolean; transactionSet?: string; delimiters?: { element: string; segment: string }; segmentCount?: number; warnings?: string[]; jedi?: unknown; error?: string; code?: string }>('/api/wizard/parse', { method: 'POST', body: JSON.stringify({ rawEdi, orgId }) }),
  wizardSend: (body: { jedi: unknown; mappingId: string | null; downstreamApiId: string; orgId: string }) =>
    apiFetch<{ success: boolean; transactionId?: string; status?: string; outboundPayload?: unknown; downstreamResponse?: { statusCode: number; body: string }; error?: string }>('/api/wizard/send', { method: 'POST', body: JSON.stringify(body) }),
};
