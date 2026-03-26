export const QUEUE_NAMES = {
  INBOUND_EDI: 'inbound-edi',
  OUTBOUND_EDI: 'outbound-edi',
  SFTP_POLL: 'sftp-poll',
  ACK_997: 'ack-997',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export const queues = QUEUE_NAMES;
