'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { ORG_ID } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { CheckCircle, AlertCircle, Loader2, ArrowRight, RotateCcw } from 'lucide-react';

const SAMPLE_204 = `ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *230101*1200*U*00401*000000001*0*P*>~
GS*SM*SENDER*RECEIVER*20230101*1200*1*X*004010~
ST*204*0001~
B2**SCAC**SH12345***PP~
L11*REF123*SI~
G62*64*20230115~
N1*SH*Shipper Inc*93*SHIP001~
N3*100 Shipping Lane~
N4*Chicago*IL*60601*US~
S5*1*CL*5000*L~
N1*SF*Origin Warehouse*93*ORIG001~
N3*200 Origin St~
N4*Chicago*IL*60602*US~
G62*10*20230115~
S5*2*CU*5000*L~
N1*ST*Destination Hub*93*DEST001~
N3*300 Destination Ave~
N4*Dallas*TX*75201*US~
G62*11*20230117~
SE*18*0001~
GE*1*1~
IEA*1*000000001~`;

const steps = ['Paste EDI', 'Parse', 'Mapping', 'Send', 'Result'];

export default function WizardPage() {
  const [step, setStep] = useState(0);
  const [rawEdi, setRawEdi] = useState('');
  const [parseResult, setParseResult] = useState<Record<string, unknown> | null>(null);
  const [parseError, setParseError] = useState('');
  const [selectedMappingId, setSelectedMappingId] = useState<string | null>(null);
  const [mappingTestResult, setMappingTestResult] = useState<Record<string, unknown> | null>(null);
  const [selectedApiId, setSelectedApiId] = useState('');
  const [sendResult, setSendResult] = useState<Record<string, unknown> | null>(null);
  const [sending, setSending] = useState(false);
  const [parsing, setParsing] = useState(false);

  const { data: mappingsData } = useSWR(step >= 2 ? 'mappings' : null, () => api.getMappings(ORG_ID));
  const { data: apisData } = useSWR(step >= 3 ? 'apis' : null, () => api.getDownstreamApis(ORG_ID));

  const mappings = mappingsData?.data ?? [];
  const apis = apisData?.data ?? [];
  const isEdiValid = rawEdi.trim().startsWith('ISA') && rawEdi.trim().length > 10;

  async function handleParse() {
    setParsing(true);
    setParseError('');
    try {
      const result = await api.wizardParse(rawEdi, ORG_ID);
      if (result.success) {
        setParseResult(result as Record<string, unknown>);
        setStep(1);
      } else {
        setParseError(`${result.error} [${result.code}]`);
      }
    } catch (err) {
      setParseError((err as Error).message);
    }
    setParsing(false);
  }

  async function handleTestMapping() {
    if (!selectedMappingId || !parseResult?.jedi) return;
    try {
      const result = await api.testMapping(selectedMappingId, parseResult.jedi);
      setMappingTestResult(result as unknown as Record<string, unknown>);
    } catch (err) {
      setMappingTestResult({ success: false, error: (err as Error).message });
    }
  }

  async function handleSend() {
    if (!selectedApiId || !parseResult?.jedi) return;
    setSending(true);
    try {
      const result = await api.wizardSend({
        jedi: parseResult.jedi,
        mappingId: selectedMappingId,
        downstreamApiId: selectedApiId,
        orgId: ORG_ID,
      });
      setSendResult(result as Record<string, unknown>);
      setStep(4);
    } catch (err) {
      setSendResult({ success: false, error: (err as Error).message });
    }
    setSending(false);
  }

  function reset() {
    setStep(0);
    setRawEdi('');
    setParseResult(null);
    setParseError('');
    setSelectedMappingId(null);
    setMappingTestResult(null);
    setSelectedApiId('');
    setSendResult(null);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <h2 className="text-2xl font-semibold">EDI Flow Wizard</h2>

      {/* Step indicator */}
      <div className="flex gap-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              i < step ? 'bg-green-600 text-white' :
              i === step ? 'bg-primary text-primary-foreground' :
              'bg-muted text-muted-foreground'
            }`}>
              {i < step ? <CheckCircle className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`text-sm ${i === step ? 'font-medium' : 'text-muted-foreground'}`}>{s}</span>
            {i < steps.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground mx-1" />}
          </div>
        ))}
      </div>

      {/* Step 1: Paste EDI */}
      {step === 0 && (
        <Card>
          <CardHeader><CardTitle>Paste Raw EDI</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setRawEdi(SAMPLE_204)}>Load sample 204</Button>
              <Button variant="outline" size="sm" onClick={() => setRawEdi('')}>Clear</Button>
            </div>
            <Textarea rows={15} className="font-mono text-xs" placeholder="ISA*00*          *00*..." value={rawEdi} onChange={(e) => setRawEdi(e.target.value)} />
            {parseError && <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">{parseError}</div>}
            <Button onClick={handleParse} disabled={!isEdiValid || parsing}>
              {parsing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Parsing...</> : 'Parse & Continue'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Parse Result */}
      {step === 1 && parseResult && (
        <Card>
          <CardHeader><CardTitle>Parse Result</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div><Label>Transaction Set</Label><p className="text-lg font-semibold">{parseResult.transactionSet as string}</p></div>
              <div><Label>Segments</Label><p className="text-lg font-semibold">{parseResult.segmentCount as number}</p></div>
              <div><Label>Delimiters</Label><p className="text-sm font-mono">element: {(parseResult.delimiters as Record<string, string>)?.element} | segment: {(parseResult.delimiters as Record<string, string>)?.segment}</p></div>
            </div>
            {(parseResult.warnings as string[])?.length > 0 && (
              <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3 text-sm text-yellow-800">
                <AlertCircle className="h-4 w-4 inline mr-2" />Warnings: {(parseResult.warnings as string[]).join(', ')}
              </div>
            )}
            <div>
              <Label>JEDI JSON</Label>
              <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-auto max-h-64 font-mono">{JSON.stringify(parseResult.jedi, null, 2)}</pre>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
              <Button onClick={() => setStep(2)}>Continue to Mapping</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Select Mapping */}
      {step === 2 && (
        <Card>
          <CardHeader><CardTitle>Select Mapping</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Mapping</Label>
              <Select value={selectedMappingId ?? '__passthrough'} onChange={(e) => setSelectedMappingId(e.target.value === '__passthrough' ? null : e.target.value)}>
                <option value="__passthrough">Passthrough (no mapping)</option>
                {mappings.filter((m) => m.direction === 'INBOUND' && m.isActive).map((m) => (
                  <option key={m.id} value={m.id}>{m.name} ({m.transactionSet})</option>
                ))}
              </Select>
            </div>
            {selectedMappingId && (
              <div className="space-y-2">
                <Label>JSONata Expression</Label>
                <pre className="p-3 bg-muted rounded-md text-xs font-mono">{mappings.find((m) => m.id === selectedMappingId)?.jsonataExpression}</pre>
                <Button variant="outline" size="sm" onClick={handleTestMapping}>Test Mapping</Button>
                {mappingTestResult && (
                  <div className={`rounded-md p-3 text-sm ${(mappingTestResult.success as boolean) ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <pre className="text-xs font-mono overflow-auto max-h-40">{JSON.stringify(mappingTestResult, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)}>Continue to Send</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Send */}
      {step === 3 && (
        <Card>
          <CardHeader><CardTitle>Select Downstream API & Send</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Downstream API</Label>
              <Select value={selectedApiId} onChange={(e) => setSelectedApiId(e.target.value)}>
                <option value="">Select an API...</option>
                {apis.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.baseUrl})</option>
                ))}
              </Select>
            </div>
            {selectedApiId && (
              <div className="text-sm text-muted-foreground">
                Auth: {apis.find((a) => a.id === selectedApiId)?.authType} | Timeout: {apis.find((a) => a.id === selectedApiId)?.timeoutMs}ms
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={handleSend} disabled={!selectedApiId || sending}>
                {sending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending...</> : 'Send to API'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Result */}
      {step === 4 && sendResult && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Result</CardTitle>
              <StatusBadge status={(sendResult.status as string) ?? ((sendResult.success as boolean) ? 'DELIVERED' : 'FAILED')} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {sendResult.transactionId != null && (
              <div><Label>Transaction ID</Label><p className="font-mono text-sm">{sendResult.transactionId as string}</p></div>
            )}
            {sendResult.error != null && (
              <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">{sendResult.error as string}</div>
            )}
            {sendResult.downstreamResponse != null && (
              <div>
                <Label>Downstream Response</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant={(sendResult.downstreamResponse as Record<string, number>).statusCode < 400 ? 'success' : 'destructive'}>
                    {(sendResult.downstreamResponse as Record<string, number>).statusCode}
                  </Badge>
                </div>
                <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-auto max-h-40 font-mono">
                  {(sendResult.downstreamResponse as Record<string, string>).body}
                </pre>
              </div>
            )}
            {sendResult.outboundPayload != null && (
              <div>
                <Label>Outbound Payload</Label>
                <pre className="mt-1 p-3 bg-muted rounded-md text-xs overflow-auto max-h-40 font-mono">{JSON.stringify(sendResult.outboundPayload, null, 2)}</pre>
              </div>
            )}
            <div className="flex gap-2">
              <a href="/transactions"><Button variant="outline">View in Transactions</Button></a>
              <Button onClick={reset}><RotateCcw className="h-4 w-4 mr-2" />Start Over</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
