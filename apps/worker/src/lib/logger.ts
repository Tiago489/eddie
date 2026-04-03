export interface Logger {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
}

export const consoleLogger: Logger = {
  info: (msg) => console.log(JSON.stringify({ level: 'info', msg, time: new Date().toISOString() })),
  warn: (msg) => console.warn(JSON.stringify({ level: 'warn', msg, time: new Date().toISOString() })),
  error: (msg) => console.error(JSON.stringify({ level: 'error', msg, time: new Date().toISOString() })),
};
