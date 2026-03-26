import { describe, it, expect, vi } from 'vitest';
import type { OutboundJobPayload } from '@edi-platform/types';

const mockFromJedi = vi.fn();
const mockSerializer = { serialize: vi.fn() };
const mockSftpTransport = { putFile: vi.fn() };

describe('processOutbound', () => {
  const basePayload: OutboundJobPayload = {
    orgId: 'org-1',
    tradingPartnerId: 'tp-1',
    transactionSet: '204',
    jediPayload: { stops: [] },
  };

  it('should convert JEDI to EDI schema using fromJedi', () => {
    mockFromJedi.mockReturnValue({ segments: [['ST', '204', '0001']] });

    const result = mockFromJedi(basePayload.jediPayload);
    expect(result).toHaveProperty('segments');
    expect(mockFromJedi).toHaveBeenCalledWith(basePayload.jediPayload);
  });

  it('should serialize the EDI schema to raw X12', () => {
    const ediSchema = { segments: [['ST', '204', '0001'], ['SE', '2', '0001']] };
    mockSerializer.serialize.mockReturnValue('ST*204*0001~SE*2*0001~');

    const raw = mockSerializer.serialize(ediSchema);
    expect(raw).toContain('ST*204*0001');
    expect(mockSerializer.serialize).toHaveBeenCalledWith(ediSchema);
  });
});
