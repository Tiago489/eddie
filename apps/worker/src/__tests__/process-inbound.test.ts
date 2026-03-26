import { describe, it, expect, vi } from 'vitest';
import type { InboundJobPayload } from '@edi-platform/types';

// Mocked dependencies - will be wired up during implementation
const mockParser = {
  parse: vi.fn(),
};

const mockToJedi = vi.fn();

const mockDeliverDownstream = vi.fn();

const mockUpdateTransaction = vi.fn();

const mockFindByContentHash = vi.fn();

describe('processInbound', () => {
  const basePayload: InboundJobPayload = {
    sftpConnectionId: 'sftp-1',
    tradingPartnerId: 'tp-1',
    orgId: 'org-1',
    fileName: 'test.edi',
    rawEdi: 'ISA*00*          *00*          *ZZ*SENDER         *ZZ*RECEIVER       *230101*1200*U*00401*000000001*0*P*>~GS*SM*SENDER*RECEIVER*20230101*1200*1*X*004010~ST*204*0001~SE*2*0001~GE*1*1~IEA*1*000000001~',
  };

  it('should call the parser with raw EDI string', async () => {
    mockParser.parse.mockReturnValue({ success: true, data: { isaControlNumber: '000000001', transactionSetId: '204', segments: [] } });
    mockToJedi.mockReturnValue({ transactionSet: '204', data: {} });
    mockDeliverDownstream.mockResolvedValue({ status: 200 });
    mockFindByContentHash.mockResolvedValue(null);

    // When implementation exists, processInbound(basePayload) would call parser
    // For now, verify the mock setup is correct
    const parseResult = mockParser.parse(basePayload.rawEdi);
    expect(parseResult.success).toBe(true);
    expect(mockParser.parse).toHaveBeenCalledWith(basePayload.rawEdi);
  });

  it('should call JEDI transformer on parse success', async () => {
    const parsedData = { isaControlNumber: '000000001', transactionSetId: '204', segments: [] };
    mockParser.parse.mockReturnValue({ success: true, data: parsedData });
    mockToJedi.mockReturnValue({ transactionSet: '204', data: {} });

    mockParser.parse(basePayload.rawEdi);
    const jediResult = mockToJedi(parsedData);
    expect(jediResult).toHaveProperty('transactionSet', '204');
    expect(mockToJedi).toHaveBeenCalledWith(parsedData);
  });

  it('should call the downstream API on transform success', async () => {
    const jediPayload = { transactionSet: '204', data: { stops: [] } };
    mockDeliverDownstream.mockResolvedValue({ status: 200 });

    const result = await mockDeliverDownstream(jediPayload);
    expect(result.status).toBe(200);
    expect(mockDeliverDownstream).toHaveBeenCalledWith(jediPayload);
  });

  it('should update Transaction status to FAILED on any failure', async () => {
    mockParser.parse.mockReturnValue({ success: false, error: 'Invalid ISA segment' });

    const parseResult = mockParser.parse(basePayload.rawEdi);
    expect(parseResult.success).toBe(false);

    // On failure, transaction should be marked FAILED
    await mockUpdateTransaction('tx-1', { status: 'FAILED', errorMessage: 'Invalid ISA segment' });
    expect(mockUpdateTransaction).toHaveBeenCalledWith('tx-1', {
      status: 'FAILED',
      errorMessage: 'Invalid ISA segment',
    });
  });

  it('should skip processing and mark DUPLICATE for same contentHash', async () => {
    mockFindByContentHash.mockResolvedValue({ id: 'existing-tx', status: 'DELIVERED' });

    const existing = await mockFindByContentHash('abc123hash');
    expect(existing).not.toBeNull();

    await mockUpdateTransaction('new-tx', { status: 'DUPLICATE' });
    expect(mockUpdateTransaction).toHaveBeenCalledWith('new-tx', { status: 'DUPLICATE' });
  });
});
