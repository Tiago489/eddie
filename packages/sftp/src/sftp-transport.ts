import SftpClient from 'ssh2-sftp-client';
import { posix } from 'path';
import type { FileTransport } from '@edi-platform/types';

export class SftpTransport implements FileTransport {
  private client: SftpClient;

  constructor(
    private config: {
      host: string;
      port: number;
      username: string;
      password: string;
    },
  ) {
    this.client = new SftpClient();
  }

  private async withConnection<T>(fn: (client: SftpClient) => Promise<T>): Promise<T> {
    await this.client.connect({
      host: this.config.host,
      port: this.config.port,
      username: this.config.username,
      password: this.config.password,
    });
    try {
      return await fn(this.client);
    } finally {
      await this.client.end();
    }
  }

  async listFiles(remotePath: string, pattern?: string): Promise<string[]> {
    return this.withConnection(async (client) => {
      const entries = await client.list(remotePath);

      let files = entries.filter((e) => e.type === '-');

      if (pattern) {
        const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        files = files.filter((f) => regex.test(f.name));
      }

      return files.map((f) => posix.join(remotePath, f.name));
    });
  }

  async getFile(remotePath: string): Promise<Buffer> {
    return this.withConnection(async (client) => {
      const result = await client.get(remotePath);
      return result as Buffer;
    });
  }

  async archiveFile(sourcePath: string, archivePath: string): Promise<void> {
    return this.withConnection(async (client) => {
      const archiveDir = posix.dirname(archivePath);
      const dirExists = await client.exists(archiveDir);
      if (!dirExists) {
        await client.mkdir(archiveDir, true);
      }
      await client.rename(sourcePath, archivePath);
    });
  }

  async deleteFile(remotePath: string): Promise<void> {
    return this.withConnection(async (client) => {
      await client.delete(remotePath);
    });
  }

  async putFile(path: string, content: Buffer): Promise<void> {
    return this.withConnection(async (client) => {
      await client.put(content, path);
    });
  }
}
