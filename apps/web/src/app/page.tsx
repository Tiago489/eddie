import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollText, CheckCircle, XCircle, Users } from 'lucide-react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

async function fetchStats() {
  try {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    const orgId = process.env.NEXT_PUBLIC_ORG_ID ?? 'default-org';
    const [txRes, tpRes] = await Promise.all([
      fetch(`${base}/api/transactions?orgId=${orgId}&page=1&limit=10`, { cache: 'no-store' }),
      fetch(`${base}/api/trading-partners?orgId=${orgId}`, { cache: 'no-store' }),
    ]);
    const txData = txRes.ok ? await txRes.json() : null;
    const tpData = tpRes.ok ? await tpRes.json() : null;
    return { txData, tpData };
  } catch {
    return { txData: null, tpData: null };
  }
}

export default async function DashboardPage() {
  const { txData, tpData } = await fetchStats();
  const transactions = txData?.data ?? [];
  const total = txData?.total ?? 0;
  const delivered = transactions.filter((t: { status: string }) => t.status === 'DELIVERED').length;
  const failed = transactions.filter((t: { status: string }) => t.status === 'FAILED').length;
  const activePartners = tpData?.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
            <ScrollText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Delivered</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{delivered}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed</CardTitle>
            <XCircle className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{failed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Partners</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activePartners}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No transactions yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Control #</TableHead>
                  <TableHead>Transaction Set</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx: { id: string; isaControlNumber: string; transactionSet: string; direction: string; status: string; createdAt: string }) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <Link href={`/transactions?id=${tx.id}`} className="text-blue-600 hover:underline">
                        {tx.isaControlNumber?.slice(0, 12) || tx.id.slice(0, 8)}
                      </Link>
                    </TableCell>
                    <TableCell>{tx.transactionSet}</TableCell>
                    <TableCell>{tx.direction}</TableCell>
                    <TableCell><StatusBadge status={tx.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{new Date(tx.createdAt).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
