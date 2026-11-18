import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pyScript = path.join(__dirname, 'build-brand-assets.py');
execSync(`python3 "${pyScript}"`, { stdio: 'inherit' });
