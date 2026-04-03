'use client';
import { useState, useCallback } from 'react';

export interface TradingPartnerDisplay {
  name: string;
  isaId: string;
  gsId: string;
  direction: string;
}

export interface SftpDisplay {
  host: string;
  port: number;
  scac: string;
  remotePath: string;
  outboundRemotePath?: string;
  pollingIntervalSeconds: number;
}

export interface DownstreamApiDisplay {
  name: string;
  endpoint: string;
  authType: string;
  timeoutMs: number;
}

export interface WizardMappingEntry {
  transactionSet: string;
  mappingId: string;
  mappingName: string;
}

export interface WizardState {
  step: 1 | 2 | 3 | 4 | 5 | 6;

  tradingPartnerId: string | null;
  tradingPartnerDisplay: TradingPartnerDisplay | null;

  sftpConnectionId: string | null;
  sftpDisplay: SftpDisplay | null;

  inboundMappings: WizardMappingEntry[];
  outboundMappings: WizardMappingEntry[];

  downstreamApiId: string | null;
  downstreamApiDisplay: DownstreamApiDisplay | null;
}

const INITIAL: WizardState = {
  step: 1,
  tradingPartnerId: null,
  tradingPartnerDisplay: null,
  sftpConnectionId: null,
  sftpDisplay: null,
  inboundMappings: [],
  outboundMappings: [],
  downstreamApiId: null,
  downstreamApiDisplay: null,
};

export function useWizardState() {
  const [state, setState] = useState<WizardState>(INITIAL);

  const setStep = useCallback((step: WizardState['step']) => {
    setState((s) => ({ ...s, step }));
  }, []);

  const next = useCallback(() => {
    setState((s) => ({ ...s, step: Math.min(s.step + 1, 6) as WizardState['step'] }));
  }, []);

  const back = useCallback(() => {
    setState((s) => ({ ...s, step: Math.max(s.step - 1, 1) as WizardState['step'] }));
  }, []);

  const update = useCallback((partial: Partial<WizardState>) => {
    setState((s) => ({ ...s, ...partial }));
  }, []);

  return { state, setStep, next, back, update };
}
