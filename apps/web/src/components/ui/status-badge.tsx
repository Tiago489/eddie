import { Badge } from './badge';

const statusMap: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'success'; label: string }> = {
  DELIVERED: { variant: 'success', label: 'Delivered' },
  FAILED: { variant: 'destructive', label: 'Failed' },
  DUPLICATE: { variant: 'secondary', label: 'Duplicate' },
  RECEIVED: { variant: 'default', label: 'Received' },
  PARSING: { variant: 'default', label: 'Parsing' },
  MAPPING: { variant: 'default', label: 'Mapping' },
  DELIVERING: { variant: 'default', label: 'Delivering' },
};

export function StatusBadge({ status }: { status: string }) {
  const config = statusMap[status] ?? { variant: 'secondary' as const, label: status };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
