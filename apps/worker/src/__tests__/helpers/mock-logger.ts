import type { Logger } from '../../lib/logger';

export interface MockLogEntry {
  level: 'info' | 'warn' | 'error';
  msg: string;
}

export interface MockLogger extends Logger {
  messages: MockLogEntry[];
}

export function createMockLogger(): MockLogger {
  const messages: MockLogEntry[] = [];
  return {
    messages,
    info: (msg: string) => { messages.push({ level: 'info', msg }); },
    warn: (msg: string) => { messages.push({ level: 'warn', msg }); },
    error: (msg: string) => { messages.push({ level: 'error', msg }); },
  };
}
