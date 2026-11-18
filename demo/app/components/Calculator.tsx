'use client';

import { CALCULATOR_LAYOUT, createCalculator } from 'property-calculators/calculator';
import { useEffect, useState, useSyncExternalStore } from 'react';

// Illustrative figures only. A real app fetches live rates and passes them to setRates.
const SAMPLE_RATES = [
    { currency: 'EUR', value: 0.86 },
    { currency: 'USD', value: 0.79 },
];

export default function Calculator() {
    const [calculator] = useState(() => createCalculator());
    const state = useSyncExternalStore(calculator.subscribe, calculator.getState, calculator.getState);
    const ratesLoaded = Boolean(state.rates);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            const typing = target.isContentEditable || Boolean(target.closest('input, textarea, select'));
            if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
            if (calculator.press(event.key)) event.preventDefault();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [calculator]);

    return (
        <section>
            <h2>Desk calculator</h2>

            <div className="calculator">
                <output aria-live="polite">{calculator.getDisplay()}</output>

                <div className="pads">
                    {[CALCULATOR_LAYOUT.extra, CALCULATOR_LAYOUT.basic].map((group) => (
                        <div
                            key={group.columns}
                            className="pad"
                            style={{ gridTemplateColumns: `repeat(${group.columns}, minmax(0, 1fr))` }}
                        >
                            {group.buttons.map((button) => (
                                <button
                                    key={button.id}
                                    type="button"
                                    aria-label={button.ariaLabel}
                                    data-variant={button.variant}
                                    disabled={button.requiresRates && !ratesLoaded}
                                    onClick={() => calculator.input(button.value)}
                                >
                                    {button.label}
                                </button>
                            ))}
                        </div>
                    ))}
                </div>
            </div>

            <p className="hint">
                {ratesLoaded ? (
                    'Currency buttons are using sample exchange rates (€1 = £0.86, $1 = £0.79).'
                ) : (
                    <>
                        Currency buttons are off until rates are set.{' '}
                        <button type="button" className="link" onClick={() => calculator.setRates(SAMPLE_RATES)}>
                            Load sample rates
                        </button>
                    </>
                )}{' '}
                Keyboard works too: digits, + − * /, Enter, Backspace, k and m.
            </p>
        </section>
    );
}
