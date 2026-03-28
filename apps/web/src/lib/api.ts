import type {
  TradingPartner, SftpConnection, Mapping, MappingTestResult,
  DownstreamApi, Transaction, TransactionParams, TransactionPage,
} from './types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
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

  getSftpConnections: (orgId: string) =>
    apiFetch<{ data: SftpConnection[] }>(`/api/sftp-connections?orgId=${orgId}`),
  createSftpConnection: (body: unknown) =>
    apiFetch<SftpConnection>('/api/sftp-connections', { method: 'POST', body: JSON.stringify(body) }),
  updateSftpConnection: (id: string, body: unknown) =>
    apiFetch<SftpConnection>(`/api/sftp-connections/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteSftpConnection: (id: string) =>
    apiFetch(`/api/sftp-connections/${id}`, { method: 'DELETE' }),

  getMappings: (orgId: string) =>
    apiFetch<{ data: Mapping[] }>(`/api/mappings?orgId=${orgId}`),
  createMapping: (body: unknown) =>
    apiFetch<Mapping>('/api/mappings', { method: 'POST', body: JSON.stringify(body) }),
  testMapping: (id: string, input: unknown) =>
    apiFetch<MappingTestResult>(`/api/mappings/${id}/test`, { method: 'POST', body: JSON.stringify({ input }) }),

  getDownstreamApis: (orgId: string) =>
    apiFetch<{ data: DownstreamApi[] }>(`/api/downstream-apis?orgId=${orgId}`),
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
