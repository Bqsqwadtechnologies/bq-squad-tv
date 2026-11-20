import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Verification terminology enforcement', () => {
  it('enforces KYC across all source, docs, android, and scripts (no legacy k-y-b term allowed)', () => {
    const targetWord = ['k', 'y', 'b'].join('');
    const regex = new RegExp(targetWord, 'i');
    const rootDir = path.resolve(__dirname, '../..');
    const scannedDirs = ['src', 'android', 'scripts', 'docs'];
    const forbiddenMatches: string[] = [];

    function scanDir(dir: string) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(rootDir, fullPath);

        // DECISIONS.md history is explicitly exempted by specification
        if (relPath === 'docs/DECISIONS.md' || entry.name === 'node_modules' || entry.name === '.git') {
          continue;
        }

        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          // Check file name
          if (regex.test(entry.name)) {
            forbiddenMatches.push(`File name contains forbidden term: ${relPath}`);
          }
          // Check file content
          try {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (regex.test(content)) {
              forbiddenMatches.push(`File content contains forbidden term: ${relPath}`);
            }
          } catch {
            // binary file or unreadable, ignore
          }
        }
      }
    }

    for (const dirName of scannedDirs) {
      scanDir(path.join(rootDir, dirName));
    }

    expect(forbiddenMatches, `Found forbidden term occurrences:\n${forbiddenMatches.join('\n')}`).toEqual([]);
  });
});
