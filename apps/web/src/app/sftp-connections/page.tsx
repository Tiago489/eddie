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
import { Server, Plus } from 'lucide-react';
import { useState } from 'react';
import type { SftpConnection } from '@/lib/types';

export default function SftpConnectionsPage() {
  const { data, isLoading, mutate } = useSWR('sftp-connections', () => api.getSftpConnections(ORG_ID));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    tradingPartnerId: '', host: '', port: '22', username: '', password: '',
    remotePath: '/inbound', archivePath: '/archive', filePattern: '*.edi', pollingIntervalSeconds: '300',
  });

  const connections = data?.data ?? [];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await api.createSftpConnection({ ...form, port: Number(form.port), pollingIntervalSeconds: Number(form.pollingIntervalSeconds) });
    setOpen(false);
    mutate();
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this SFTP connection?')) return;
    await api.deleteSftpConnection(id);
    mutate();
  }

  const columns = [
    { header: 'Host', accessor: 'host' as const },
    { header: 'Port', accessor: (r: SftpConnection) => String(r.port) },
    { header: 'Username', accessor: 'username' as const },
    { header: 'Remote Path', accessor: 'remotePath' as const },
    { header: 'Polling', accessor: (r: SftpConnection) => `${r.pollingIntervalSeconds}s` },
    { header: 'Status', accessor: (r: SftpConnection) => <Badge variant={r.isActive ? 'success' : 'secondary'}>{r.isActive ? 'Active' : 'Inactive'}</Badge> },
    { header: 'Actions', accessor: (r: SftpConnection) => <Button variant="ghost" size="sm" onClick={() => handleDelete(r.id)}>Delete</Button> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">SFTP Connections</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2" />Add Connection</Button></DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Create SFTP Connection</DialogTitle></DialogHeader>
            <form onSubmit={handleCreate} className="space-y-3">
              <div><Label>Trading Partner ID</Label><Input required value={form.tradingPartnerId} onChange={(e) => setForm({ ...form, tradingPartnerId: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2"><Label>Host</Label><Input required value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} /></div>
                <div><Label>Port</Label><Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Username</Label><Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
                <div><Label>Password</Label><Input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Remote Path</Label><Input value={form.remotePath} onChange={(e) => setForm({ ...form, remotePath: e.target.value })} /></div>
                <div><Label>Archive Path</Label><Input value={form.archivePath} onChange={(e) => setForm({ ...form, archivePath: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>File Pattern</Label><Input value={form.filePattern} onChange={(e) => setForm({ ...form, filePattern: e.target.value })} /></div>
                <div><Label>Polling (sec)</Label><Input type="number" value={form.pollingIntervalSeconds} onChange={(e) => setForm({ ...form, pollingIntervalSeconds: e.target.value })} /></div>
              </div>
              <Button type="submit" className="w-full">Create</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {!isLoading && connections.length === 0 ? (
        <EmptyState icon={Server} title="No SFTP connections" description="Create an SFTP connection to start polling for EDI files." />
      ) : (
        <DataTable columns={columns} data={connections} isLoading={isLoading} />
      )}
    </div>
  );
}
