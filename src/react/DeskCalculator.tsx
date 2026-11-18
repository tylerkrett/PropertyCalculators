import { type CSSProperties, useEffect, useState, useSyncExternalStore } from 'react';

import { CALCULATOR_LAYOUT } from '../calculator/layout';
import { type Calculator, createCalculator, type ExchangeRate } from '../calculator/store';
import { type BaseProps, slots, Styles } from './shared';

export type DeskCalculatorProps = BaseProps & {
    /**
     * Exchange rates for the currency buttons: what one unit of each currency is worth in pounds.
     * The buttons stay disabled until EUR and USD are both supplied.
     */
    rates?: ExchangeRate[];
    /** Respond to the keyboard anywhere on the page, except while typing in a field. Defaults to `true`. */
    keyboard?: boolean;
    /** Show the conversion buttons (currency, area, rent, VAT). Defaults to `true`. */
    conversions?: boolean;
    /** Bring your own store from `createCalculator()` to read or drive it from outside. */
    calculator?: Calculator;
};

export function DeskCalculator({
    rates,
    keyboard = true,
    conversions = true,
    calculator: provided,
    className,
    classNames,
    unstyled,
    inlineStyles,
    theme = 'light',
    ...rest
}: DeskCalculatorProps) {
    const cx = slots(classNames, !unstyled && 'pc-styled', 'pc-calculator', className);
    const [own] = useState(() => createCalculator());
    const calculator = provided ?? own;
    const state = useSyncExternalStore(calculator.subscribe, calculator.getState, calculator.getState);
    const ratesReady = typeof state.rates?.EUR === 'number' && typeof state.rates?.USD === 'number';

    useEffect(() => {
        if (rates) calculator.setRates(rates);
    }, [calculator, rates]);

    useEffect(() => {
        if (!keyboard) return;
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            const typing = target?.isContentEditable || Boolean(target?.closest?.('input, textarea, select'));
            if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
            if (calculator.press(event.key)) event.preventDefault();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [calculator, keyboard]);

    const groups = conversions
        ? ([
              ['extra', CALCULATOR_LAYOUT.extra],
              ['basic', CALCULATOR_LAYOUT.basic],
          ] as const)
        : ([['basic', CALCULATOR_LAYOUT.basic]] as const);

    return (
        <div {...rest} data-theme={theme} className={cx('root')}>
            <Styles unstyled={unstyled} inlineStyles={inlineStyles} />

            <output className={cx('display')} aria-live="polite">
                {calculator.getDisplay()}
            </output>

            <div className={cx('pads')} data-conversions={conversions || undefined}>
                {groups.map(([name, group]) => (
                    <div
                        key={name}
                        className={cx('pad')}
                        data-group={name}
                        style={{ '--pc-columns': group.columns } as CSSProperties}
                    >
                        {group.buttons.map((button) => (
                            <button
                                key={button.id}
                                type="button"
                                className={cx('key')}
                                aria-label={button.ariaLabel}
                                data-variant={button.variant}
                                data-key={button.id}
                                disabled={button.requiresRates && !ratesReady}
                                onClick={() => calculator.input(button.value)}
                            >
                                {button.label}
                            </button>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}
