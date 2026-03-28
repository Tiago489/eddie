'use client';
import { useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { Upload, Trash2, FileText, CheckCircle, XCircle, Loader2, Shield } from 'lucide-react';
import Link from 'next/link';
import type { FixtureUploadResult } from '@/lib/types';

export default function FixturesPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, mutate } = useSWR(
    id ? `fixtures-${id}` : null,
    () => api.getFixtures(id),
  );
  const fixtures = data?.fixtures ?? [];

  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<FixtureUploadResult | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = useCallback(async (files: File[]) => {
    setUploading(true);
    setUploadResult(null);
    try {
      const result = await api.uploadFixture(id, files);
      setUploadResult(result);
      if (result.success) await mutate();
    } catch (err) {
      setUploadResult({
        success: false,
        error: err instanceof Error ? err.message : 'Upload failed',
      });
    } finally {
      setUploading(false);
    }
  }, [id, mutate]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) handleUpload(files);
  }, [handleUpload]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) handleUpload(files);
    e.target.value = '';
  }, [handleUpload]);

  const handleDelete = useCallback(async (fixtureName: string) => {
    await api.deleteFixture(id, fixtureName);
    mutate();
  }, [id, mutate]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">Test Fixtures</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Upload production EDI files to create mapping test fixtures
          </p>
        </div>
        <Link href="/mappings"><Button variant="outline">Back to Mappings</Button></Link>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".edi,.json,application/json"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Processing files...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">Drop files here or click to upload</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <p><span className="font-medium text-foreground/70">Single file:</span> drop one .edi file — auto-generates expected output</p>
              <p><span className="font-medium text-foreground/70">Paired files:</span> drop .edi + .json with matching names (e.g. NWKD_211.edi + NWKD_211.json) — uses JSON as Stedi ground truth</p>
            </div>
          </div>
        )}
      </div>

      {/* Upload result feedback */}
      {uploadResult && (
        <div className={`rounded-lg p-4 text-sm ${
          uploadResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          {uploadResult.success ? (
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-medium text-green-800">
                <CheckCircle className="h-4 w-4" />
                Fixture created: {uploadResult.fixture}
                {uploadResult.source === 'stedi' && (
                  <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300">Ground Truth</Badge>
                )}
              </div>
              {uploadResult.testResult?.pass && (
                <p className="text-green-700">Test passed in {uploadResult.testResult.durationMs}ms</p>
              )}
              {uploadResult.testResult && !uploadResult.testResult.pass && (
                <p className="text-yellow-700">Test failed — expected output may differ from mapping output</p>
              )}
              {uploadResult.warnings && uploadResult.warnings.length > 0 && (
                <div className="text-yellow-700 mt-2">
                  <p className="font-medium">Warnings:</p>
                  <ul className="list-disc list-inside">
                    {uploadResult.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-red-800">
              <XCircle className="h-4 w-4" />
              <span>{uploadResult.error}</span>
            </div>
          )}
        </div>
      )}

      {/* Fixtures table */}
      {!isLoading && fixtures.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No fixtures yet"
          description="Upload an EDI file to create your first test fixture for this mapping."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fixture</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>EDI Preview</TableHead>
              <TableHead>Last Tested</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[80px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fixtures.map((f) => (
              <TableRow key={f.name}>
                <TableCell className="font-mono text-sm">{f.name}</TableCell>
                <TableCell>
                  {f.source === 'stedi' ? (
                    <Badge className="bg-yellow-100 text-yellow-800 border-yellow-300 gap-1">
                      <Shield className="h-3 w-3" />
                      Stedi
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Auto-generated</Badge>
                  )}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground max-w-xs truncate">
                  {f.inputEdiPreview}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(f.lastTestedAt).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={f.lastTestPassed ? 'success' : 'destructive'}>
                    {f.lastTestPassed ? 'Pass' : 'Fail'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(f.name)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
