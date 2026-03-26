export interface FileTransport {
  listFiles(path: string, pattern?: string): Promise<string[]>;
  getFile(path: string): Promise<Buffer>;
  archiveFile(sourcePath: string, archivePath: string): Promise<void>;
  deleteFile(path: string): Promise<void>;
}
