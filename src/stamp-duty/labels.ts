import { formatRange } from './format';
import type { StampDutyEstimate } from './estimate';

/*
 * The words a stamp duty UI needs, so both sites label things the same way. Nothing here is
 * markup: map over it and render with your own components.
 */

/** `£0 – £125,000`, `£125,001 – £250,000`, `£1,500,001+`. */
export const formatBandRange = ({ from, to }: { from: number; to: number | null }): string => formatRange([from, to]);

/**
 * The three checkboxes of the form. Each maps to `stateKey` in the form state; when `invert` is
 * set the box is ticked when the state value is `false` (ticking "non-UK resident" clears `ukResident`).
 */
export const STAMP_DUTY_FIELDS = [
    {
        name: 'isBuyToLetOrSecondHome',
        label: 'Property is a buy to let or second home',
        stateKey: 'secondHome',
        invert: false,
    },
    { name: 'isFirstTimeBuyer', label: 'Purchaser is a first time buyer', stateKey: 'firstTimeBuyer', invert: false },
    { name: 'isNonUKResident', label: 'Purchaser is a non-UK resident', stateKey: 'ukResident', invert: true },
] as const;

export const STAMP_DUTY_LABELS = {
    title: 'Stamp Duty',
    price: 'Property Price',
    address: 'Address',
    stampDuty: 'Stamp Duty to pay',
    actualRate: 'Actual rate',
    breakdown: 'How this result was calculated',
    calculate: 'Calculate',
    nonUkResident: 'Purchaser is a non-UK resident',
} as const;

/** Breakdown table columns; `key` indexes a band's `formatted` object. */
export const STAMP_DUTY_COLUMNS = [
    { key: 'range', label: 'Tax Band', align: 'left' },
    { key: 'rate', label: '% Rate', align: 'right' },
    { key: 'taxable', label: 'Taxable Sum', align: 'right' },
    { key: 'tax', label: 'Tax', align: 'right' },
] as const;

export type StampDutyColumnKey = (typeof STAMP_DUTY_COLUMNS)[number]['key'];

/**
 * An estimate laid out for rendering: headline figures, then the breakdown as columns and rows
 * of strings. `key` on each row is stable for React lists.
 */
export function getStampDutyTable(estimate: StampDutyEstimate) {
    return {
        summary: [
            { key: 'price', label: STAMP_DUTY_LABELS.price, value: estimate.price, formatted: estimate.formatted.price },
            {
                key: 'stampDuty',
                label: STAMP_DUTY_LABELS.stampDuty,
                value: estimate.stampDuty,
                formatted: estimate.formatted.stampDuty,
            },
            {
                key: 'effectiveRate',
                label: STAMP_DUTY_LABELS.actualRate,
                value: estimate.effectiveRate,
                formatted: estimate.formatted.effectiveRate,
            },
        ],
        columns: STAMP_DUTY_COLUMNS,
        rows: estimate.bands.map((band) => ({ key: `band_${band.from}`, ...band.formatted })),
        totals: { range: 'Total', rate: '', taxable: estimate.formatted.price, tax: estimate.formatted.stampDuty },
    };
}
