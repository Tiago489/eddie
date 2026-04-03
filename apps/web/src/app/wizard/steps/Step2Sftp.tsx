'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { WizardState, SftpDisplay } from '../hooks/useWizardState';

interface Props {
  state: WizardState;
  onNext: (data: { sftpConnectionId: string; sftpDisplay: SftpDisplay }) => void;
  onBack: () => void;
}

export function Step2Sftp({ state, onNext, onBack }: Props) {
  const [form, setForm] = useState({
    host: '',
    port: '22',
    username: '',
    password: '',
    scac: '',
    remotePath: '/inbound',
    outboundRemotePath: '/outbound',
    archivePath: '/archive',
    pollingIntervalSeconds: '60',
    filePattern: '*.edi',
  });
  const [error, setError] = useState('');
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await api.testSftpConnection({
        host: form.host,
        port: Number(form.port),
        username: form.username,
        password: form.password,
      });
      setTestResult(result);
    } catch {
      setTestResult({ success: false, message: 'Test request failed' });
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.host.trim()) { setError('Host is required'); return; }
    if (!form.username.trim()) { setError('Username is required'); return; }
    if (!form.password.trim()) { setError('Password is required'); return; }
    if (!form.scac.trim()) { setError('SCAC is required'); return; }
    if (!form.remotePath.trim()) { setError('Remote path is required'); return; }
    if (Number(form.pollingIntervalSeconds) < 10) { setError('Polling interval must be at least 10 seconds'); return; }

    setSubmitting(true);
    try {
      const payload = {
        tradingPartnerId: state.tradingPartnerId,
        host: form.host,
        port: Number(form.port),
        username: form.username,
        password: form.password,
        scac: form.scac,
        remotePath: form.remotePath,
        outboundRemotePath: form.outboundRemotePath || undefined,
        archivePath: form.archivePath,
        pollingIntervalSeconds: Number(form.pollingIntervalSeconds),
        filePattern: form.filePattern || undefined,
      };

      const display: SftpDisplay = {
        host: form.host,
        port: Number(form.port),
        scac: form.scac,
        remotePath: form.remotePath,
        outboundRemotePath: form.outboundRemotePath || undefined,
        pollingIntervalSeconds: Number(form.pollingIntervalSeconds),
      };
      if (state.sftpConnectionId) {
        await api.updateSftpConnection(state.sftpConnectionId, { ...payload, password: form.password });
        onNext({ sftpConnectionId: state.sftpConnectionId, sftpDisplay: display });
      } else {
        const conn = await api.createSftpConnection(payload);
        onNext({ sftpConnectionId: conn.id, sftpDisplay: display });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      if (msg.includes('Trading partner not found')) {
        setError('Trading partner not found \u2014 please go back to Step 1');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <h3 className="text-lg font-semibold">Step 2: SFTP Connection</h3>
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2">
          <Label>Host</Label>
          <Input required value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} placeholder="sftp.carrier.com" />
        </div>
        <div>
          <Label>Port</Label>
          <Input type="number" value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Username</Label>
          <Input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </div>
        <div>
          <Label>Password</Label>
          <Input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
      </div>
      <div>
        <Label>SCAC (Carrier Code)</Label>
        <Input required value={form.scac} onChange={(e) => setForm({ ...form, scac: e.target.value })} placeholder="e.g. ACME" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Remote Path</Label>
          <Input value={form.remotePath} onChange={(e) => setForm({ ...form, remotePath: e.target.value })} />
        </div>
        <div>
          <Label>Outbound Path</Label>
          <Input value={form.outboundRemotePath} onChange={(e) => setForm({ ...form, outboundRemotePath: e.target.value })} />
        </div>
        <div>
          <Label>Archive Path</Label>
          <Input value={form.archivePath} onChange={(e) => setForm({ ...form, archivePath: e.target.value })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Polling Interval (sec)</Label>
          <Input type="number" min={10} value={form.pollingIntervalSeconds} onChange={(e) => setForm({ ...form, pollingIntervalSeconds: e.target.value })} />
        </div>
        <div>
          <Label>File Pattern</Label>
          <Input value={form.filePattern} onChange={(e) => setForm({ ...form, filePattern: e.target.value })} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" onClick={handleTest} disabled={testing || !form.host || !form.username || !form.password}>
          {testing ? 'Testing...' : 'Test Connection'}
        </Button>
        {testResult && (
          <span className={`text-sm ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
            {testResult.success ? '\u2705' : '\u274c'} {testResult.message}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack}>Back</Button>
        <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Next'}</Button>
      </div>
    </form>
  );
}
