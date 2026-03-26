import type { FileTransport } from '@edi-platform/types';

export interface PollerConfig {
  remotePath: string;
  archivePath: string;
  filePattern: string;
}

export interface PollerEvents {
  onFileFound: (filePath: string, content: Buffer) => Promise<void>;
}

export class SftpPoller {
  private processing: Set<string> = new Set();

  constructor(
    private transport: FileTransport,
    private config: PollerConfig,
    private events: PollerEvents,
  ) {}

  async poll(): Promise<number> {
    const filePaths = await this.transport.listFiles(this.config.remotePath, this.config.filePattern);
    let processed = 0;

    for (const filePath of filePaths) {
      if (this.processing.has(filePath)) {
        continue;
      }

      this.processing.add(filePath);

      try {
        const content = await this.transport.getFile(filePath);
        await this.events.onFileFound(filePath, content);
        const fileName = filePath.split('/').pop() || filePath;
        await this.transport.archiveFile(
          filePath,
          `${this.config.archivePath}/${fileName}`,
        );
        processed++;
      } catch (error) {
        this.processing.delete(filePath);
        throw error;
      }
    }

    return processed;
  }
}
