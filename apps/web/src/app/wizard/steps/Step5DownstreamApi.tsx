'use client';
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { ORG_ID, KNOWN_DOWNSTREAM_APIS } from '@/lib/constants';
import type { WizardState, DownstreamApiDisplay } from '../hooks/useWizardState';

interface Props {
  state: WizardState;
  onNext: (data: { downstreamApiId: string; downstreamApiDisplay: DownstreamApiDisplay }) => void;
  onBack: () => void;
}

export function Step5DownstreamApi({ state, onNext, onBack }: Props) {
  const [form, setForm] = useState({
    name: '',
    endpoint: '' as string,
    customUrl: '',
    authType: 'NONE' as string,
    credentials: '',
    timeoutMs: '5000',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getDefaultDownstreamApi().then((res) => {
      if (res.data) {
        const d = res.data;
        // Find which known endpoint matches
        const knownEntry = Object.entries(KNOWN_DOWNSTREAM_APIS).find(([, url]) => url === d.baseUrl);
        setForm({
          name: d.name,
          endpoint: knownEntry ? knownEntry[1] : KNOWN_DOWNSTREAM_APIS.CUSTOM,
          customUrl: knownEntry ? '' : d.baseUrl,
          authType: d.authType,
          credentials: '',
          timeoutMs: String(d.timeoutMs),
        });
      }
    }).catch(() => {});
  }, []);

  function getBaseUrl() {
    if (form.endpoint === KNOWN_DOWNSTREAM_APIS.CUSTOM) return form.customUrl;
    return form.endpoint;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) { setError('Name is required'); return; }
    const baseUrl = getBaseUrl();
    if (!baseUrl.trim()) { setError('Endpoint URL is required'); return; }
    if (form.authType !== 'NONE' && !form.credentials.trim()) { setError('Credentials are required for this auth type'); return; }
    if (Number(form.timeoutMs) < 1000) { setError('Timeout must be at least 1000ms'); return; }

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        orgId: ORG_ID,
        name: form.name,
        baseUrl,
        authType: form.authType,
        timeoutMs: Number(form.timeoutMs),
      };
      if (form.credentials) {
        payload.credentials = form.credentials;
      }

      const display: DownstreamApiDisplay = {
        name: form.name,
        endpoint: baseUrl,
        authType: form.authType,
        timeoutMs: Number(form.timeoutMs),
      };
      if (state.downstreamApiId) {
        await api.updateDownstreamApi(state.downstreamApiId, payload);
        onNext({ downstreamApiId: state.downstreamApiId, downstreamApiDisplay: display });
      } else {
        const record = await api.createDownstreamApi(payload);
        onNext({ downstreamApiId: record.id, downstreamApiDisplay: display });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  }

  const authLabels: Record<string, string> = { API_KEY: 'API Key', BEARER: 'Bearer Token', BASIC: 'username:password' };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <h3 className="text-lg font-semibold">Step 5: Downstream API</h3>
      <div>
        <Label>Name</Label>
        <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. TMS API" />
      </div>
      <div>
        <Label>Endpoint</Label>
        <Select value={form.endpoint} onChange={(e) => setForm({ ...form, endpoint: e.target.value })}>
          <option value="">Select endpoint...</option>
          <option value={KNOWN_DOWNSTREAM_APIS.TMS_PRODUCTION}>TMS Production</option>
          <option value={KNOWN_DOWNSTREAM_APIS.TMS_STAGING}>TMS Staging</option>
          <option value={KNOWN_DOWNSTREAM_APIS.TMS_LOCAL}>TMS Local</option>
          <option value={KNOWN_DOWNSTREAM_APIS.CUSTOM}>Custom</option>
        </Select>
      </div>
      {form.endpoint === KNOWN_DOWNSTREAM_APIS.CUSTOM && (
        <div>
          <Label>Custom URL</Label>
          <Input type="url" required value={form.customUrl} onChange={(e) => setForm({ ...form, customUrl: e.target.value })} placeholder="https://..." />
        </div>
      )}
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
        <div>
          <Label>{authLabels[form.authType] ?? 'Credentials'}</Label>
          <Input type="password" value={form.credentials} onChange={(e) => setForm({ ...form, credentials: e.target.value })} />
        </div>
      )}
      <div>
        <Label>Timeout (ms)</Label>
        <Input type="number" min={1000} value={form.timeoutMs} onChange={(e) => setForm({ ...form, timeoutMs: e.target.value })} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-3">
        <Button type="button" variant="outline" onClick={onBack}>Back</Button>
        <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Next'}</Button>
      </div>
    </form>
  );
}
