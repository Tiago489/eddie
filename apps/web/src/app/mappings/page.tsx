'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { ORG_ID } from '@/lib/constants';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { GitBranch, Pencil, FileText } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { Mapping } from '@/lib/types';

function InlineName({ mapping, onSave }: { mapping: Mapping; onSave: (id: string, name: string) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(mapping.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(mapping.name);
  }, [mapping.name]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || trimmed === mapping.name) {
      setValue(mapping.name);
      setEditing(false);
      return;
    }
    try {
      await onSave(mapping.id, trimmed);
    } catch {
      setValue(mapping.name);
    }
    setEditing(false);
  }, [value, mapping.id, mapping.name, onSave]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') {
      setValue(mapping.name);
      setEditing(false);
    }
  };

  // Derive placeholder: [Carrier] TransactionSet DIRECTION
  const txNum = mapping.transactionSet.replace('EDI_', '');
  const placeholder = `[Carrier] ${txNum} ${mapping.direction}`;

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="h-8 w-full max-w-md text-sm"
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-1.5 text-left text-sm hover:text-primary transition-colors"
    >
      <span>{mapping.name}</span>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 transition-opacity" />
    </button>
  );
}

export default function MappingsPage() {
  const router = useRouter();
  const [showInactive, setShowInactive] = useState(false);
  const { data, isLoading, mutate } = useSWR(
    ['mappings', showInactive],
    () => api.getMappings(ORG_ID, showInactive),
  );
  const mappings = data?.data ?? [];
  const activeCount = mappings.filter((m) => m.isActive).length;

  const handleToggleActive = async (id: string, isActive: boolean) => {
    // Optimistic update
    mutate(
      (prev) => prev ? { data: prev.data.map((m) => m.id === id ? { ...m, isActive } : m) } : prev,
      false,
    );
    try {
      await api.updateMapping(id, { isActive });
    } catch {
      mutate(); // revert on error
    }
  };

  const handleRename = async (id: string, name: string) => {
    mutate(
      (prev) => prev ? { data: prev.data.map((m) => m.id === id ? { ...m, name } : m) } : prev,
      false,
    );
    try {
      await api.updateMapping(id, { name });
    } catch {
      mutate(); // revert on error
      throw new Error('Failed to rename');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">
          Mappings{!isLoading && ` (${activeCount} active)`}
        </h2>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showInactive} onCheckedChange={setShowInactive} />
            Show inactive
          </label>
          <Link href="/mappings/new"><Button>Create Mapping</Button></Link>
        </div>
      </div>

      {!isLoading && mappings.length === 0 ? (
        <EmptyState icon={GitBranch} title="No mappings" description="Create a JSONata mapping to transform EDI data." />
      ) : isLoading ? (
        <Table>
          <TableHeader>
            <TableRow>
              {['Name', 'Transaction Set', 'Direction', 'Version', 'Status', 'Active', ''].map((h) => (
                <TableHead key={h}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Transaction Set</TableHead>
              <TableHead>Direction</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((m) => (
              <TableRow
                key={m.id}
                className={`cursor-pointer ${!m.isActive ? 'opacity-50' : ''}`}
                onClick={() => router.push(`/mappings/${m.id}`)}
              >
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <InlineName mapping={m} onSave={handleRename} />
                </TableCell>
                <TableCell>{m.transactionSet}</TableCell>
                <TableCell>{m.direction}</TableCell>
                <TableCell>{m.version}</TableCell>
                <TableCell>
                  <Badge variant={m.isActive ? 'success' : 'secondary'}>
                    {m.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={m.isActive}
                    onCheckedChange={(checked) => handleToggleActive(m.id, checked)}
                  />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Link href={`/mappings/${m.id}/fixtures`}>
                    <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                      <FileText className="h-3.5 w-3.5" />
                      Fixtures
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
