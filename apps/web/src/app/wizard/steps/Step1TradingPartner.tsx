'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { ORG_ID } from '@/lib/constants';
import type { WizardState, TradingPartnerDisplay } from '../hooks/useWizardState';

interface Props {
  state: WizardState;
  onNext: (data: { tradingPartnerId: string; tradingPartnerDisplay: TradingPartnerDisplay }) => void;
}

export function Step1TradingPartner({ state, onNext }: Props) {
  const [form, setForm] = useState({
    name: '',
    isaId: '',
    gsId: '',
    direction: 'BOTH' as string,
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.name.trim()) { setError('Name is required'); return; }
    if (!form.isaId.trim()) { setError('ISA ID is required'); return; }
    if (!form.gsId.trim()) { setError('GS ID is required'); return; }

    setSubmitting(true);
    try {
      const display: TradingPartnerDisplay = {
        name: form.name, isaId: form.isaId, gsId: form.gsId, direction: form.direction,
      };
      if (state.tradingPartnerId) {
        await api.patchTradingPartner(state.tradingPartnerId, {
          name: form.name, isaId: form.isaId, gsId: form.gsId, direction: form.direction,
        });
        onNext({ tradingPartnerId: state.tradingPartnerId, tradingPartnerDisplay: display });
      } else {
        const tp = await api.createTradingPartner({
          orgId: ORG_ID, name: form.name, isaId: form.isaId, gsId: form.gsId, direction: form.direction,
        });
        onNext({ tradingPartnerId: tp.id, tradingPartnerDisplay: display });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <h3 className="text-lg font-semibold">Step 1: Trading Partner</h3>
      <div>
        <Label>Name</Label>
        <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. ACME Carrier" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>ISA ID (ISA06)</Label>
          <Input required value={form.isaId} onChange={(e) => setForm({ ...form, isaId: e.target.value })} placeholder="e.g. ACMECARRIER01" maxLength={15} />
        </div>
        <div>
          <Label>GS ID (GS02)</Label>
          <Input required value={form.gsId} onChange={(e) => setForm({ ...form, gsId: e.target.value })} placeholder="e.g. ACMECARRIER" />
        </div>
      </div>
      <div>
        <Label>Direction</Label>
        <Select value={form.direction} onChange={(e) => setForm({ ...form, direction: e.target.value })}>
          <option value="INBOUND">Inbound</option>
          <option value="OUTBOUND">Outbound</option>
          <option value="BOTH">Both</option>
        </Select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <Button type="submit" disabled={submitting}>{submitting ? 'Saving...' : 'Next'}</Button>
    </form>
  );
}
