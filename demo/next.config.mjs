import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The library is linked from the parent folder, so let Next read files from there.
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @type {import('next').NextConfig} */
export default {
    outputFileTracingRoot: root,
    turbopack: { root },
};
