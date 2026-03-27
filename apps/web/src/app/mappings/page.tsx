'use client';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { ORG_ID } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { GitBranch } from 'lucide-react';
import Link from 'next/link';
import type { Mapping } from '@/lib/types';

export default function MappingsPage() {
  const { data, isLoading } = useSWR('mappings', () => api.getMappings(ORG_ID));
  const mappings = data?.data ?? [];

  const columns = [
    { header: 'Name', accessor: 'name' as const },
    { header: 'Transaction Set', accessor: 'transactionSet' as const },
    { header: 'Direction', accessor: 'direction' as const },
    { header: 'Version', accessor: (r: Mapping) => String(r.version) },
    { header: 'Status', accessor: (r: Mapping) => <Badge variant={r.isActive ? 'success' : 'secondary'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Mappings</h2>
        <Link href="/mappings/new"><Button>Create Mapping</Button></Link>
      </div>
      {!isLoading && mappings.length === 0 ? (
        <EmptyState icon={GitBranch} title="No mappings" description="Create a JSONata mapping to transform EDI data." />
      ) : (
        <DataTable columns={columns} data={mappings} isLoading={isLoading} />
      )}
    </div>
  );
}
