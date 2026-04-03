'use client';
import { useWizardState } from './hooks/useWizardState';
import { WizardProgress } from './components/WizardProgress';
import { Step1TradingPartner } from './steps/Step1TradingPartner';
import { Step2Sftp } from './steps/Step2Sftp';
import { Step3InboundMappings } from './steps/Step3InboundMappings';
import { Step4OutboundMappings } from './steps/Step4OutboundMappings';
import { Step5DownstreamApi } from './steps/Step5DownstreamApi';
import { Step6Review } from './steps/Step6Review';

export default function WizardPage() {
  const { state, next, back, update } = useWizardState();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Flow Wizard</h2>
      <WizardProgress currentStep={state.step} />

      {state.step === 1 && (
        <Step1TradingPartner
          state={state}
          onNext={(data) => { update(data); next(); }}
        />
      )}
      {state.step === 2 && (
        <Step2Sftp
          state={state}
          onNext={(data) => { update(data); next(); }}
          onBack={back}
        />
      )}
      {state.step === 3 && (
        <Step3InboundMappings
          state={state}
          onNext={(data) => { update(data); next(); }}
          onBack={back}
        />
      )}
      {state.step === 4 && (
        <Step4OutboundMappings
          state={state}
          onNext={(data) => { update(data); next(); }}
          onBack={back}
        />
      )}
      {state.step === 5 && (
        <Step5DownstreamApi
          state={state}
          onNext={(data) => { update(data); next(); }}
          onBack={back}
        />
      )}
      {state.step === 6 && (
        <Step6Review
          state={state}
          onBack={back}
        />
      )}
    </div>
  );
}
