import { baseBands as defaultBands } from './default';
import type { Band } from './types';

export const initialThreshold: Band[] = [{ range: [0, 39_999], rate: 0 }];

export const highPriceBands = defaultBands;

export const baseBands: Band[] = [
    { range: [0, 300_000], rate: 0 },
    { range: [300_000, 500_000], rate: 5 },
];

export default function getBands(price: number): Band[] {
    if (price < 40_000) return initialThreshold;
    if (price <= 500_000) return baseBands;
    return highPriceBands;
}
