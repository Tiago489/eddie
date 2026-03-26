import type { FileTransport } from '@edi-platform/types';

export class MockTransport implements FileTransport {
  private files: Map<string, Buffer> = new Map();
  private archived: Map<string, Buffer> = new Map();

  addFile(path: string, content: string | Buffer): void {
    this.files.set(path, typeof content === 'string' ? Buffer.from(content) : content);
  }

  async listFiles(remotePath: string, pattern?: string): Promise<string[]> {
    const result: string[] = [];

    for (const filePath of this.files.keys()) {
      if (!filePath.startsWith(remotePath)) continue;

      if (pattern) {
        const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
        if (!regex.test(filePath)) continue;
      }

      result.push(filePath);
    }

    return result;
  }

  async getFile(remotePath: string): Promise<Buffer> {
    const file = this.files.get(remotePath);
    if (!file) throw new Error(`File not found: ${remotePath}`);
    return file;
  }

  async archiveFile(sourcePath: string, archivePath: string): Promise<void> {
    const file = this.files.get(sourcePath);
    if (!file) throw new Error(`File not found: ${sourcePath}`);
    this.archived.set(archivePath, file);
    this.files.delete(sourcePath);
  }

  async deleteFile(remotePath: string): Promise<void> {
    this.files.delete(remotePath);
  }

  getArchivedFiles(): Map<string, Buffer> {
    return this.archived;
  }
}
