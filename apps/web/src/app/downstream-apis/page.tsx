'use client';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { ORG_ID } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/data-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plug, Plus } from 'lucide-react';
import { useState } from 'react';
import type { DownstreamApi } from '@/lib/types';

export default function DownstreamApisPage() {
  const { data, isLoading, mutate } = useSWR('downstream-apis', () => api.getDownstreamApis(ORG_ID));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '', baseUrl: '', authType: 'NONE', credentials: '', timeoutMs: '5000',
  });

  const apis = data?.data ?? [];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.createDownstreamApi({ ...form, orgId: ORG_ID, timeoutMs: Number(form.timeoutMs) });
    setOpen(false);
    mutate();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this API?')) return;
    await api.deleteDownstreamApi(id);
    mutate();
  }

  const authLabels: Record<string, string> = { API_KEY: 'API Key', BEARER: 'Bearer Token', BASIC: 'username:password' };

  const columns = [
    { header: 'Name', accessor: 'name' as const },
    { header: 'Base URL', accessor: 'baseUrl' as const },
    { header: 'Auth', accessor: 'authType' as const },
    { header: 'Timeout', accessor: (r: DownstreamApi) => `${r.timeoutMs}ms` },
    { header: 'Actions', accessor: (r: DownstreamApi) => <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}>Delete</Button> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">Downstream APIs</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add API</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Downstream API</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-4">
              <div><Label>Name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Base URL</Label><Input required type="url" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} /></div>
              <div>
                <Label>Auth Type</Label>
                <Select value={form.authType} onChange={(e) => setForm({ ...form, authType: e.target.value })}>
                  <option value="NONE">None</option>
                  <option value="API_KEY">API Key</option>
                  <option value="BEARER">Bearer Token</option>
                  <option value="BASIC">Basic Auth</option>
                </Select>
              </div>
              {form.authType !== 'NONE' && (
                <div><Label>{authLabels[form.authType] ?? 'Credentials'}</Label><Textarea value={form.credentials} onChange={(e) => setForm({ ...form, credentials: e.target.value })} /></div>
              )}
              <div><Label>Timeout (ms)</Label><Input type="number" value={form.timeoutMs} onChange={(e) => setForm({ ...form, timeoutMs: e.target.value })} /></div>
              <Button type="submit" className="w-full">Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {!isLoading && apis.length === 0 ? (
        <EmptyState icon={Plug} title="No downstream APIs" description="Configure a downstream API to receive transformed EDI data." />
      ) : (
        <DataTable columns={columns} data={apis} isLoading={isLoading} />
      )}
    </div>
  );
}
