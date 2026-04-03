import Client from 'ssh2-sftp-client';

export interface SftpTestParams {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface SftpTestResult {
  success: boolean;
  message: string;
}

export async function testSftpConnection(params: SftpTestParams): Promise<SftpTestResult> {
  const sftp = new Client();
  try {
    await sftp.connect({
      host: params.host,
      port: params.port,
      username: params.username,
      password: params.password,
      readyTimeout: 10000,
    });
    await sftp.list('/');
    return { success: true, message: 'Connection successful' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, message: `Connection failed: ${msg}` };
  } finally {
    try { await sftp.end(); } catch { /* ignore cleanup errors */ }
  }
}
