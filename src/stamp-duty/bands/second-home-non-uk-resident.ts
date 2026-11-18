import type { Band } from './types';

export const initialThreshold: Band[] = [{ range: [0, 39_999], rate: 0 }];

export const baseBands: Band[] = [
    { range: [0, 125_000], rate: 7 },
    { range: [125_000, 250_000], rate: 9 },
    { range: [250_000, 925_000], rate: 12 },
    { range: [925_000, 1_500_000], rate: 17 },
    { range: [1_500_000, Infinity], rate: 19 },
];

export default function getBands(price: number): Band[] {
    if (price >= 40_000) return baseBands;
    return initialThreshold;
}
