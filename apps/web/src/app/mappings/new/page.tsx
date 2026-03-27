'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { ORG_ID, TRANSACTION_SETS } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function NewMappingPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '', transactionSet: 'EDI_204', direction: 'INBOUND',
    jsonataExpression: '$$', version: '1',
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await api.createMapping({ ...form, orgId: ORG_ID, version: Number(form.version) });
    router.push('/mappings');
  }

  return (
    <div className="max-w-2xl">
      <h2 className="text-2xl font-semibold mb-6">Create Mapping</h2>
      <Card>
        <CardHeader><CardTitle>Mapping Details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div><Label>Name</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Transaction Set</Label>
                <Select value={form.transactionSet} onChange={(e) => setForm({ ...form, transactionSet: e.target.value })}>
                  {TRANSACTION_SETS.map((ts) => <option key={ts} value={ts}>{ts}</option>)}
                </Select>
              </div>
              <div>
                <Label>Direction</Label>
                <Select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
                  <option value="INBOUND">Inbound</option>
                  <option value="OUTBOUND">Outbound</option>
                </Select>
              </div>
            </div>
            <div><Label>Version</Label><Input value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} /></div>
            <div>
              <Label>JSONata Expression</Label>
              <div className="flex gap-2 mb-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, jsonataExpression: '$$' })}>Identity ($$)</Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, jsonataExpression: '' })}>Clear</Button>
              </div>
              <Textarea rows={12} className="font-mono text-sm" value={form.jsonataExpression} onChange={(e) => setForm({ ...form, jsonataExpression: e.target.value })} />
            </div>
            <Button type="submit" className="w-full">Create Mapping</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
