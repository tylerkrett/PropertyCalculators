import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
    title: 'property-calculators demo',
    description: 'Stamp duty, mortgage and desk calculator, rendered from the data property-calculators returns.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en-GB">
            <body>{children}</body>
        </html>
    );
}
