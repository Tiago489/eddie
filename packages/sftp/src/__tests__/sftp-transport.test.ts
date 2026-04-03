import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SftpTransport } from '../sftp-transport';

// Mock ssh2-sftp-client
vi.mock('ssh2-sftp-client', () => {
  const mockList = vi.fn().mockResolvedValue([]);
  const mockGet = vi.fn().mockResolvedValue(Buffer.from(''));
  const mockPut = vi.fn().mockResolvedValue('');
  const mockRename = vi.fn().mockResolvedValue('');
  const mockDelete = vi.fn().mockResolvedValue('');
  const mockMkdir = vi.fn().mockResolvedValue('');
  const mockExists = vi.fn().mockResolvedValue(false);
  const mockConnect = vi.fn().mockResolvedValue({});
  const mockEnd = vi.fn().mockResolvedValue(true);

  class MockSftpClient {
    connect = mockConnect;
    list = mockList;
    get = mockGet;
    put = mockPut;
    rename = mockRename;
    delete = mockDelete;
    mkdir = mockMkdir;
    exists = mockExists;
    end = mockEnd;
  }

  return { default: MockSftpClient };
});

function getClientMock(transport: SftpTransport) {
  // Access the internal client for assertions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (transport as any).client;
}

const config = {
  host: 'transfer.us.stedi.com',
  port: 22,
  username: 'testuser',
  password: 'testpass',
};

describe('SftpTransport', () => {
  let transport: SftpTransport;

  beforeEach(() => {
    vi.clearAllMocks();
    transport = new SftpTransport(config);
  });

  describe('listFiles', () => {
    it('should connect, list files, filter by pattern, and disconnect', async () => {
      const client = getClientMock(transport);
      client.list.mockResolvedValue([
        { type: '-', name: 'load1.edi', size: 100, modifyTime: 1000, accessTime: 1000, rights: { user: 'rw', group: 'r', other: '' }, owner: 0, group: 0 },
        { type: '-', name: 'load2.edi', size: 200, modifyTime: 2000, accessTime: 2000, rights: { user: 'rw', group: 'r', other: '' }, owner: 0, group: 0 },
        { type: '-', name: 'readme.txt', size: 50, modifyTime: 3000, accessTime: 3000, rights: { user: 'rw', group: 'r', other: '' }, owner: 0, group: 0 },
        { type: 'd', name: 'subdir', size: 0, modifyTime: 4000, accessTime: 4000, rights: { user: 'rwx', group: 'rx', other: '' }, owner: 0, group: 0 },
      ]);

      const files = await transport.listFiles('/inbound', '*.edi');

      expect(client.connect).toHaveBeenCalledWith({
        host: 'transfer.us.stedi.com',
        port: 22,
        username: 'testuser',
        password: 'testpass',
      });
      expect(client.list).toHaveBeenCalledWith('/inbound');
      expect(files).toEqual(['/inbound/load1.edi', '/inbound/load2.edi']);
      expect(client.end).toHaveBeenCalled();
    });

    it('should return all files when no pattern is provided', async () => {
      const client = getClientMock(transport);
      client.list.mockResolvedValue([
        { type: '-', name: 'load1.edi', size: 100, modifyTime: 1000, accessTime: 1000, rights: { user: 'rw', group: 'r', other: '' }, owner: 0, group: 0 },
        { type: '-', name: 'readme.txt', size: 50, modifyTime: 2000, accessTime: 2000, rights: { user: 'rw', group: 'r', other: '' }, owner: 0, group: 0 },
      ]);

      const files = await transport.listFiles('/inbound');

      expect(files).toEqual(['/inbound/load1.edi', '/inbound/readme.txt']);
    });

    it('should disconnect even if list throws', async () => {
      const client = getClientMock(transport);
      client.list.mockRejectedValue(new Error('Permission denied'));

      await expect(transport.listFiles('/inbound')).rejects.toThrow('Permission denied');
      expect(client.end).toHaveBeenCalled();
    });
  });

  describe('getFile', () => {
    it('should connect, download file as Buffer, and disconnect', async () => {
      const client = getClientMock(transport);
      const content = Buffer.from('ISA*00*...');
      client.get.mockResolvedValue(content);

      const result = await transport.getFile('/inbound/load1.edi');

      expect(client.connect).toHaveBeenCalled();
      expect(client.get).toHaveBeenCalledWith('/inbound/load1.edi');
      expect(result).toEqual(content);
      expect(client.end).toHaveBeenCalled();
    });
  });

  describe('archiveFile', () => {
    it('should connect, create archive dir if needed, rename file, and disconnect', async () => {
      const client = getClientMock(transport);
      client.exists.mockResolvedValue(false);

      await transport.archiveFile('/inbound/load1.edi', '/archive/load1.edi');

      expect(client.connect).toHaveBeenCalled();
      expect(client.exists).toHaveBeenCalledWith('/archive');
      expect(client.mkdir).toHaveBeenCalledWith('/archive', true);
      expect(client.rename).toHaveBeenCalledWith('/inbound/load1.edi', '/archive/load1.edi');
      expect(client.end).toHaveBeenCalled();
    });

    it('should skip mkdir when archive dir exists', async () => {
      const client = getClientMock(transport);
      client.exists.mockResolvedValue('d');

      await transport.archiveFile('/inbound/load1.edi', '/archive/load1.edi');

      expect(client.mkdir).not.toHaveBeenCalled();
      expect(client.rename).toHaveBeenCalledWith('/inbound/load1.edi', '/archive/load1.edi');
    });
  });

  describe('deleteFile', () => {
    it('should connect, delete, and disconnect', async () => {
      const client = getClientMock(transport);

      await transport.deleteFile('/inbound/old.edi');

      expect(client.connect).toHaveBeenCalled();
      expect(client.delete).toHaveBeenCalledWith('/inbound/old.edi');
      expect(client.end).toHaveBeenCalled();
    });
  });

  describe('putFile', () => {
    it('should connect, upload buffer, and disconnect', async () => {
      const client = getClientMock(transport);
      const content = Buffer.from('ISA*00*...');

      await transport.putFile('/outbound/ack.edi', content);

      expect(client.connect).toHaveBeenCalled();
      expect(client.put).toHaveBeenCalledWith(content, '/outbound/ack.edi');
      expect(client.end).toHaveBeenCalled();
    });
  });
});
