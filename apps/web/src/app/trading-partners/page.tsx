'use client';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { ORG_ID } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Users, Plus } from 'lucide-react';
import { useState } from 'react';
import type { TradingPartner } from '@/lib/types';

export default function TradingPartnersPage() {
  const { data, isLoading, mutate } = useSWR('trading-partners', () => api.getTradingPartners(ORG_ID));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', isaId: '', direction: 'INBOUND' });

  const partners = data?.data ?? [];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.createTradingPartner({ ...form, orgId: ORG_ID });
    setForm({ name: '', isaId: '', direction: 'INBOUND' });
    setOpen(false);
    mutate();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this trading partner?')) return;
    await api.deleteTradingPartner(id);
    mutate();
  }

  const columns = [
    { header: 'Name', accessor: 'name' as const },
    { header: 'ISA ID', accessor: 'isaId' as const },
    { header: 'Direction', accessor: 'direction' as const },
    {
      header: 'Status',
      accessor: (row: TradingPartner) => (
        <Badge variant={row.isActive ? 'success' : 'secondary'}>{row.isActive ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    {
      header: 'Actions',
      accessor: (row: TradingPartner) => (
        <Button variant="ghost" size="sm" onClick={() => handleDelete(row.id)}>
          Delete
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Trading Partners</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-2" />Add Partner</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Trading Partner</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div><Label>Name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>ISA ID</Label><Input required maxLength={15} value={form.isaId} onChange={(e) => setForm({ ...form, isaId: e.target.value })} /></div>
              <div>
                <Label>Direction</Label>
                <Select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                  <option value="INBOUND">Inbound</option>
                  <option value="OUTBOUND">Outbound</option>
                  <option value="BOTH">Both</option>
                </Select>
              </div>
              <Button type="submit" className="w-full">Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {!isLoading && partners.length === 0 ? (
        <EmptyState icon={Users} title="No trading partners" description="Create your first trading partner to get started." />
      ) : (
        <DataTable columns={columns} data={partners} isLoading={isLoading} />
      )}
    </div>
  );
}
