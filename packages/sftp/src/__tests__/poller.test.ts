import { describe, it, expect, vi } from 'vitest';
import { MockTransport } from '../mock-transport';
import { SftpPoller } from '../poller';

describe('SftpPoller', () => {
  function createPoller(transport: MockTransport, onFileFound = vi.fn().mockResolvedValue(undefined)) {
    const poller = new SftpPoller(
      transport,
      {
        remotePath: '/inbound',
        archivePath: '/archive',
        filePattern: '*.edi',
      },
      { onFileFound },
    );
    return { poller, onFileFound };
  }

  it('should list files matching a pattern', async () => {
    const transport = new MockTransport();
    transport.addFile('/inbound/test1.edi', 'EDI content 1');
    transport.addFile('/inbound/test2.edi', 'EDI content 2');
    transport.addFile('/inbound/readme.txt', 'Not an EDI file');

    const { poller, onFileFound } = createPoller(transport);
    await poller.poll();

    expect(onFileFound).toHaveBeenCalledTimes(2);
  });

  it('should emit a job for each matched file', async () => {
    const transport = new MockTransport();
    transport.addFile('/inbound/load1.edi', 'EDI 204 content');
    transport.addFile('/inbound/load2.edi', 'EDI 211 content');

    const { poller, onFileFound } = createPoller(transport);
    await poller.poll();

    expect(onFileFound).toHaveBeenCalledTimes(2);
    const firstCallArgs = onFileFound.mock.calls[0];
    expect(firstCallArgs[0]).toBe('/inbound/load1.edi');
    expect(firstCallArgs[1]).toBeInstanceOf(Buffer);
  });

  it('should archive each file after successful job emission', async () => {
    const transport = new MockTransport();
    transport.addFile('/inbound/test.edi', 'EDI content');

    const { poller } = createPoller(transport);
    await poller.poll();

    const archived = transport.getArchivedFiles();
    expect(archived.has('/archive/test.edi')).toBe(true);

    const remaining = await transport.listFiles('/inbound', '*.edi');
    expect(remaining).toHaveLength(0);
  });

  it('should NOT re-process a file that is already being processed', async () => {
    const transport = new MockTransport();
    transport.addFile('/inbound/test.edi', 'EDI content');

    const onFileFound = vi.fn().mockResolvedValue(undefined);
    const { poller } = createPoller(transport, onFileFound);

    // First poll processes the file
    await poller.poll();

    // Re-add the same file
    transport.addFile('/inbound/test.edi', 'EDI content');

    // Second poll should skip it (idempotency)
    await poller.poll();

    expect(onFileFound).toHaveBeenCalledTimes(1);
  });
});
