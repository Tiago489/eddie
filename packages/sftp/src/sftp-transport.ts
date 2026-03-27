import type { FileTransport } from '@edi-platform/types';

export class SftpTransport implements FileTransport {
  constructor(
    private config: {
      host: string;
      port: number;
      username: string;
      password: string;
    },
  ) {}

  async listFiles(_remotePath: string, _pattern?: string): Promise<string[]> {
    throw new Error('Not implemented');
  }

  async getFile(_remotePath: string): Promise<Buffer> {
    throw new Error('Not implemented');
  }

  async archiveFile(_sourcePath: string, _archivePath: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async deleteFile(_remotePath: string): Promise<void> {
    throw new Error('Not implemented');
  }

  async putFile(_path: string, _content: Buffer): Promise<void> {
    throw new Error('Not implemented');
  }
}
