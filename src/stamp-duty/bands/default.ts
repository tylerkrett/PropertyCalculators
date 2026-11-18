import type { Band } from './types';

export const initialThreshold: Band[] = [{ range: [0, 39_999], rate: 0 }];

export const baseBands: Band[] = [
    { range: [0, 125_000], rate: 0 },
    { range: [125_000, 250_000], rate: 2 },
    { range: [250_000, 925_000], rate: 5 },
    { range: [925_000, 1_500_000], rate: 10 },
    { range: [1_500_000, Infinity], rate: 12 },
];

export default function getBands(price: number): Band[] {
    if (price > 39_999) return baseBands;
    return initialThreshold;
}
