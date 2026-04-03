'use client';

const STEPS = [
  'Partner',
  'SFTP',
  'Inbound Maps',
  'Outbound Maps',
  'Downstream API',
  'Review',
];

export function WizardProgress({ currentStep }: { currentStep: number }) {
  return (
    <div className="flex items-center gap-1 mb-8">
      {STEPS.map((label, i) => {
        const stepNum = i + 1;
        const isActive = stepNum === currentStep;
        const isComplete = stepNum < currentStep;
        return (
          <div key={label} className="flex items-center gap-1 flex-1">
            <div className="flex flex-col items-center flex-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold ${
                  isComplete
                    ? 'bg-green-600 text-white'
                    : isActive
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}
              >
                {isComplete ? '\u2713' : stepNum}
              </div>
              <span className={`text-xs mt-1 text-center ${isActive ? 'font-semibold text-blue-600' : 'text-slate-500'}`}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={`h-0.5 flex-1 -mt-4 ${isComplete ? 'bg-green-600' : 'bg-slate-200'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
