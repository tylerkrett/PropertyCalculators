'use client';

import {
    DeskCalculator,
    MortgageCalculator,
    RentalYieldCalculator,
    StampDutyCalculator,
} from 'property-calculators/react';
import { type CSSProperties, useState } from 'react';

// Illustrative figures only. A real app fetches live rates.
const SAMPLE_RATES = [
    { currency: 'EUR', value: 0.86 },
    { currency: 'USD', value: 0.79 },
];

const LOOKS = {
    default: { label: 'Default', props: {} },
    dark: { label: 'Dark', props: { theme: 'dark' as const } },
    brand: {
        label: 'Restyled with variables',
        props: {
            style: {
                '--pc-accent': '#b4232a',
                '--pc-soft': '#fbeeee',
                '--pc-line': '#e7caca',
                '--pc-radius': '2px',
                '--pc-font': 'Georgia, serif',
            } as CSSProperties,
        },
    },
    unstyled: { label: 'Unstyled', props: { unstyled: true } },
};

// The download button prints what is on screen, in this brand. Add `logo: '/logo.png'` for a logo.
const BRAND = { name: 'Harlow & Finch', colour: '#b3261e', footer: 'harlowfinch.example · 020 7946 0000' };

type Look = keyof typeof LOOKS;

export default function ComponentsDemo() {
    const [look, setLook] = useState<Look>('default');
    const props = LOOKS[look].props;

    return (
        <main data-look={look}>
            <header>
                <h1>Ready-made components</h1>
                <p>
                    Imported from <code>property-calculators/react</code> with no CSS file and no setup. Switch the look
                    to see the same three components themed. <a href="/">Back to the build-your-own demo</a>
                </p>
                <div className="segmented" role="group" aria-label="Look">
                    {(Object.keys(LOOKS) as Look[]).map((key) => (
                        <label key={key}>
                            <input type="radio" name="look" checked={look === key} onChange={() => setLook(key)} />
                            <span>{LOOKS[key].label}</span>
                        </label>
                    ))}
                </div>
            </header>

            <section>
                <h2>{'<StampDutyCalculator />'}</h2>
                <StampDutyCalculator defaultPrice={750_000} pdf={BRAND} {...props} />
            </section>

            <section>
                <h2>{'<MortgageCalculator />'}</h2>
                <MortgageCalculator defaultPrice={500_000} pdf={BRAND} {...props} />
            </section>

            <section>
                <h2>{'<RentalYieldCalculator />'}</h2>
                <RentalYieldCalculator defaultPrice={400_000} defaultRent={2_000} pdf={BRAND} {...props} />
            </section>

            <section>
                <h2>{'<DeskCalculator />'}</h2>
                <DeskCalculator rates={SAMPLE_RATES} {...props} />
            </section>
        </main>
    );
}
