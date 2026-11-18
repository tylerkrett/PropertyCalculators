import { baseBands as defaultBands } from './non-uk-resident';
import type { Band } from './types';

export const initialThreshold: Band[] = [{ range: [0, 39_999], rate: 0 }];

export const baseBands: Band[] = [
    { range: [0, 300_000], rate: 2 },
    { range: [300_000, 500_000], rate: 7 },
];

export const highPriceBands = defaultBands;

export default function getBands(price: number): Band[] {
    if (price < 40_000) return initialThreshold;
    if (price <= 500_000) return baseBands;
    return highPriceBands;
}
