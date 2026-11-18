import { readFile, writeFile } from 'node:fs/promises';

import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        'stamp-duty/index': 'src/stamp-duty/index.ts',
        'calculator/index': 'src/calculator/index.ts',
        'mortgage/index': 'src/mortgage/index.ts',
        'rental-yield/index': 'src/rental-yield/index.ts',
        'react/index': 'src/react/index.ts',
        'pdf/index': 'src/pdf/index.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    splitting: true,
    target: 'es2020',
    external: ['react', 'react/jsx-runtime'],
    async onSuccess() {
        // The components use hooks, so mark their entry as client code for React Server Components.
        for (const file of ['dist/react/index.js', 'dist/react/index.cjs']) {
            const code = await readFile(file, 'utf8');
            if (!code.startsWith('"use client"')) await writeFile(file, `"use client";\n${code}`);
        }
        // Publish the default styles as a plain stylesheet too.
        const { STYLES } = await import('./src/react/styles');
        await writeFile('dist/styles.css', `${STYLES.trim()}\n`);
    },
});
