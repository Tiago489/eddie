'use client';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, FileText } from 'lucide-react';
import Link from 'next/link';

export default function MappingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: mapping, isLoading } = useSWR(
    id ? `mapping-${id}` : null,
    () => api.getMapping(id),
  );
  const [activeTab, setActiveTab] = useState<'details' | 'fixtures'>('details');

  if (isLoading || !mapping) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/mappings">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
          <h2 className="text-2xl font-semibold">{mapping.name}</h2>
          <Badge variant={mapping.isActive ? 'success' : 'secondary'}>
            {mapping.isActive ? 'Active' : 'Inactive'}
          </Badge>
        </div>
        <Link href={`/mappings/${id}/fixtures`}>
          <Button className="gap-2">
            <FileText className="h-4 w-4" />
            Test Fixtures
          </Button>
        </Link>
      </div>

      <div className="border-b">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('details')}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'details'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('fixtures')}
            className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'fixtures'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Fixtures
          </button>
        </div>
      </div>

      {activeTab === 'details' ? (
        <div className="grid grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mapping Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Transaction Set</span>
                <span className="font-mono">{mapping.transactionSet}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Direction</span>
                <span>{mapping.direction}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Version</span>
                <span>{mapping.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Guide ID</span>
                <span className="font-mono text-xs">{mapping.guideId ?? 'None'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={mapping.isActive ? 'success' : 'secondary'}>
                  {mapping.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(mapping.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Updated</span>
                <span>{new Date(mapping.updatedAt).toLocaleDateString()}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">JSONata Expression</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-slate-950 text-slate-50 rounded-lg p-4 text-xs overflow-auto max-h-96 leading-relaxed">
                <code>{mapping.jsonataExpression}</code>
              </pre>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="rounded-lg border p-6 text-center space-y-3">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Upload and manage test fixtures for this mapping
          </p>
          <Link href={`/mappings/${id}/fixtures`}>
            <Button>Open Fixtures</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
