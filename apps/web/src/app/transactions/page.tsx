'use client';
import useSWR from 'swr';
import { useState } from 'react';
import { api } from '@/lib/api';
import { ORG_ID, TRANSACTION_STATUSES } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollText } from 'lucide-react';
import type { Transaction } from '@/lib/types';

export default function TransactionsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const { data, isLoading } = useSWR(
    ORG_ID ? ['transactions', page, status] : null,
    () => api.getTransactions({ orgId: ORG_ID, page: String(page), limit: '50', ...(status ? { status } : {}) }),
  );

  const transactions = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  async function handleReprocess(id: string) {
    await api.reprocessTransaction(id);
    alert('Transaction queued for reprocessing');
  }

  const columns = [
    { header: 'Control #', accessor: (r: Transaction) => r.isaControlNumber?.slice(0, 12) || r.id.slice(0, 8) },
    { header: 'Tx Set', accessor: 'transactionSet' as const },
    { header: 'Direction', accessor: 'direction' as const },
    { header: 'Status', accessor: (r: Transaction) => <StatusBadge status={r.status} /> },
    { header: 'Created', accessor: (r: Transaction) => new Date(r.createdAt).toLocaleString() },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Transaction Log</h2>

      <div className="flex gap-4 items-end">
        <div>
          <Label>Status</Label>
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">All</option>
            {TRANSACTION_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </div>
        {status && <Button variant="ghost" onClick={() => { setStatus(''); setPage(1); }}>Clear</Button>}
      </div>

      {!isLoading && transactions.length === 0 ? (
        <EmptyState icon={ScrollText} title="No transactions" description="No transactions match your filters." />
      ) : (
        <>
          <DataTable columns={columns} data={transactions} isLoading={isLoading} onRowClick={(tx) => setSelectedTx(tx)} />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Page {page} of {totalPages || 1} ({total} total)</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}

      {selectedTx && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Transaction Detail: {selectedTx.isaControlNumber || selectedTx.id.slice(0, 8)}</CardTitle>
            <div className="flex items-center gap-2">
              <StatusBadge status={selectedTx.status} />
              {selectedTx.status === 'FAILED' && (
                <Button size="sm" variant="outline" onClick={() => handleReprocess(selectedTx.id)}>Reprocess</Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelectedTx(null)}>Close</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedTx.errorMessage && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">{selectedTx.errorMessage}</div>
            )}
            {selectedTx.downstreamStatusCode && (
              <p className="text-sm"><span className="text-muted-foreground">Downstream Status:</span> {selectedTx.downstreamStatusCode}</p>
            )}
            <div className="grid grid-cols-1 gap-4">
              {selectedTx.rawEdi && (
                <div>
                  <Label>Raw EDI</Label>
                  <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-auto max-h-64 font-mono">{selectedTx.rawEdi}</pre>
                </div>
              )}
              {selectedTx.jediPayload != null && (
                <div>
                  <Label>JEDI JSON</Label>
                  <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-auto max-h-64 font-mono">{JSON.stringify(selectedTx.jediPayload, null, 2)}</pre>
                </div>
              )}
              {selectedTx.outboundPayload != null && (
                <div>
                  <Label>Outbound Payload</Label>
                  <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-auto max-h-64 font-mono">{JSON.stringify(selectedTx.outboundPayload, null, 2)}</pre>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Created: {new Date(selectedTx.createdAt).toLocaleString()} | Updated: {new Date(selectedTx.updatedAt).toLocaleString()}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
