// Fails when a source file is longer than MAX_LINES, so files stay small enough to read in one go.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MAX_LINES = 250;
const ROOTS = ['src', 'tests', 'scripts', 'demo/app'];
const EXTENSIONS = /\.(ts|tsx|mjs|css)$/;
const SKIP = new Set(['node_modules', '__snapshots__', '.next', 'dist']);

function* files(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (SKIP.has(entry.name)) continue;
        const path = join(dir, entry.name);
        if (entry.isDirectory()) yield* files(path);
        else if (EXTENSIONS.test(entry.name)) yield path;
    }
}

const tooLong = ROOTS.flatMap((root) => [...files(root)])
    .map((path) => ({ path, lines: readFileSync(path, 'utf8').trimEnd().split('\n').length }))
    .filter((file) => file.lines > MAX_LINES);

for (const { path, lines } of tooLong) console.error(`${path}: ${lines} lines (limit ${MAX_LINES})`);
process.exit(tooLong.length > 0 ? 1 : 0);
