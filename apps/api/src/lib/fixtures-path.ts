import * as path from 'path';

export const FIXTURES_DIR = path.resolve(
  process.cwd(),
  'packages/jedi/src/mapping-tests/fixtures',
);

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\[([^\]]+)\]/g, '$1')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
