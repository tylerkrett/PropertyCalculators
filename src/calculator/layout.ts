import { operation } from './engine';

/*
 * The calculator's buttons as data. Render each group as a grid of `columns` columns, in order;
 * on click pass `button.value` to `calculator.input` (or the `updateExpression` action).
 */

export type CalculatorButton = {
    /** Stable id, usable as a React key or test id. */
    id: string;
    /** What the button shows, as plain text. */
    label: string;
    /** For conversions: the two sides of the arrow, so they can be styled apart (`ft²` → `m²`). */
    from?: string;
    to?: string;
    /** For screen readers. */
    ariaLabel: string;
    /** What to feed the calculator. */
    value: number | symbol;
    /** `digit` plain keys, `operator` + − × ÷ =, `clear` the two clear keys, `function` conversions. */
    variant: 'digit' | 'operator' | 'clear' | 'function';
    /** Disable until exchange rates have been set. */
    requiresRates: boolean;
};

type Variant = CalculatorButton['variant'];

const key = (id: string, label: string, ariaLabel: string, value: number | symbol, variant: Variant) =>
    ({ id, label, ariaLabel, value, variant, requiresRates: false }) satisfies CalculatorButton;

const digit = (n: number) => key(`digit-${n}`, String(n), String(n), n, 'digit');

const convert = (id: string, from: string, to: string, ariaLabel: string, value: symbol, requiresRates = false) =>
    ({
        id,
        label: `${from} → ${to}`,
        from,
        to,
        ariaLabel,
        value,
        variant: 'function',
        requiresRates,
    }) satisfies CalculatorButton;

/** The standard keypad: four columns, five rows. */
export const BASIC_BUTTONS: readonly CalculatorButton[] = [
    key('clear-entry', 'CE', 'Clear entry', operation.clear, 'clear'),
    key('all-clear', 'C', 'Clear all', operation.allClear, 'clear'),
    key('percent', '%', 'Percent', operation.percent, 'digit'),
    key('divide', '÷', 'Divide', operation.divide, 'operator'),
    digit(7),
    digit(8),
    digit(9),
    key('multiply', '×', 'Multiply', operation.multiply, 'operator'),
    digit(4),
    digit(5),
    digit(6),
    key('minus', '−', 'Subtract', operation.minus, 'operator'),
    digit(1),
    digit(2),
    digit(3),
    key('add', '+', 'Add', operation.add, 'operator'),
    digit(0),
    key('invert', '+/-', 'Change sign', operation.invert, 'digit'),
    key('decimal', '.', 'Decimal point', operation.decimal, 'digit'),
    key('equals', '=', 'Equals', operation.equals, 'operator'),
];

/** The property-specific conversions: two columns, five rows. Each applies to the number on screen. */
export const EXTRA_BUTTONS: readonly CalculatorButton[] = [
    convert('gbp-eur', '£', '€', 'Pounds to euros', operation.gbpEur, true),
    convert('eur-gbp', '€', '£', 'Euros to pounds', operation.eurGbp, true),
    convert('gbp-usd', '£', '$', 'Pounds to US dollars', operation.gbpUsd, true),
    convert('usd-gbp', '$', '£', 'US dollars to pounds', operation.usdGbp, true),
    convert('ft-m', 'ft²', 'm²', 'Square feet to square metres', operation.ftToM),
    convert('m-ft', 'm²', 'ft²', 'Square metres to square feet', operation.mToFt),
    convert('pcm-pw', 'pcm', 'pw', 'Per calendar month to per week', operation.pcmToPw),
    convert('pw-pcm', 'pw', 'pcm', 'Per week to per calendar month', operation.pwToPcm),
    key('vat-minus', '−VAT', 'Remove VAT at 20%', operation.vatMinus, 'function'),
    key('vat-plus', '+VAT', 'Add VAT at 20%', operation.vatPlus, 'function'),
];

export const CALCULATOR_LAYOUT = {
    extra: { columns: 2, buttons: EXTRA_BUTTONS },
    basic: { columns: 4, buttons: BASIC_BUTTONS },
} as const;

/** Keyboard keys the calculator responds to, beyond the digits, for a shortcuts hint. */
export const CALCULATOR_KEYS = [
    { key: '+', action: 'Add' },
    { key: '-', action: 'Subtract' },
    { key: '*', action: 'Multiply' },
    { key: '/', action: 'Divide' },
    { key: 'Enter', action: 'Equals' },
    { key: '=', action: 'Equals' },
    { key: '%', action: 'Percent' },
    { key: '.', action: 'Decimal point' },
    { key: 'Backspace', action: 'Delete the last digit' },
    { key: 'k', action: 'Multiply by a thousand' },
    { key: 'm', action: 'Multiply by a million' },
] as const;

export const CALCULATOR_TEXT = {
    ratesFootnote: 'Exchange rates are updated every hour.',
    ratesError: 'We were unable to determine the exchange rates',
    ratesRetry: 'try again now',
} as const;

/** The fixed conversion factors the engine uses, for labels and tooltips. */
export const CONVERSIONS = { vatRate: 20, squareFeetPerSquareMetre: 10.7639, weeksPerYear: 52, monthsPerYear: 12 } as const;
