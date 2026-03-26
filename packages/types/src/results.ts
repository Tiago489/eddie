export enum ParseErrorCode {
  INVALID_ISA = 'INVALID_ISA',
  INVALID_GS = 'INVALID_GS',
  INVALID_ST = 'INVALID_ST',
  MISSING_SEGMENT = 'MISSING_SEGMENT',
  INVALID_SEGMENT = 'INVALID_SEGMENT',
  UNSUPPORTED_VERSION = 'UNSUPPORTED_VERSION',
  UNSUPPORTED_TRANSACTION_SET = 'UNSUPPORTED_TRANSACTION_SET',
  INVALID_ISA_ENVELOPE = 'INVALID_ISA_ENVELOPE',
  MISSING_TRANSACTION_SET = 'MISSING_TRANSACTION_SET',
  INVALID_TRANSACTION_SET = 'INVALID_TRANSACTION_SET',
  ENVELOPE_MISMATCH = 'ENVELOPE_MISMATCH',
  UNKNOWN = 'UNKNOWN',
}

export type ParseResult<T> =
  | { success: true; data: T; warnings: string[] }
  | { success: false; error: string; code: ParseErrorCode };

export type MappingResult<T> =
  | { success: true; output: T }
  | { success: false; error: string; expression?: string };
