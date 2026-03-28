import type { TmsOutputSchema } from './tms-schema';

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

function getValueAtPath(obj: Record<string, unknown>, path: string): { found: boolean; value: unknown } {
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return { found: false, value: undefined };
    }
    current = (current as Record<string, unknown>)[part];
  }

  return { found: current !== undefined && current !== null, value: current };
}

function collectAllPaths(obj: unknown, prefix = ''): string[] {
  if (obj === null || obj === undefined || typeof obj !== 'object') return [];

  const paths: string[] = [];
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      const arrayPath = `${prefix}[${i}]`;
      paths.push(arrayPath);
      paths.push(...collectAllPaths(obj[i], arrayPath));
    }
  } else {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      paths.push(fullPath);
      paths.push(...collectAllPaths((obj as Record<string, unknown>)[key], fullPath));
    }
  }
  return paths;
}

function normalizePath(path: string): string {
  return path.replace(/\[(\d+)\]/g, '.$1');
}

function isSubPathOf(candidate: string, declared: string): boolean {
  const normCandidate = normalizePath(candidate);
  const normDeclared = normalizePath(declared);

  if (normCandidate === normDeclared) return true;
  if (normCandidate.startsWith(normDeclared + '.')) return true;

  // Handle array wildcard: "stops" covers "stops[0]", "stops[0].location", etc.
  // Replace array indices with nothing to check prefix
  const declaredParts = normDeclared.split('.');
  const candidateParts = normCandidate.split('.');

  let di = 0;
  let ci = 0;
  while (di < declaredParts.length && ci < candidateParts.length) {
    const dp = declaredParts[di];
    let cp = candidateParts[ci];

    if (dp === cp) {
      di++;
      ci++;
      continue;
    }

    // candidate part might be an array index
    if (/^\d+$/.test(cp)) {
      ci++;
      continue;
    }

    return false;
  }

  return di === declaredParts.length;
}

export function validateTmsOutput(output: unknown, schema: TmsOutputSchema): ValidationResult {
  if (output === null || output === undefined) {
    return { valid: false, errors: ['Output is null or undefined'] };
  }

  if (typeof output !== 'object' || Array.isArray(output)) {
    return { valid: false, errors: ['Output must be a non-null object'] };
  }

  const errors: string[] = [];
  const obj = output as Record<string, unknown>;

  // Check required fields
  for (const path of schema.required) {
    const { found } = getValueAtPath(obj, path);
    if (!found) {
      errors.push(`Missing required field: ${path}`);
    }
  }

  // Check for extra fields
  if (schema.noExtraFields) {
    const declaredPaths = [...schema.required, ...schema.optional];
    const allPaths = collectAllPaths(obj);

    for (const actualPath of allPaths) {
      const isCovered = declaredPaths.some((declared) => isSubPathOf(actualPath, declared));
      if (!isCovered) {
        errors.push(`Unexpected field: ${actualPath}`);
      }
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

export type { TmsOutputSchema };
