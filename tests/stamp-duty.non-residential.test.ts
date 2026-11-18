import { describe, expect, it } from 'vitest';

import { calculateStampDuty } from '../src';

describe('non-residential rates', () => {
    it('matches the GOV.UK example: £275,000 freehold is £3,250', () => {
        const estimate = calculateStampDuty({ price: 275_000, propertyType: 'non-residential' });
        expect(estimate.stampDuty).toBe(3_250);
        expect(estimate.propertyType).toBe('non-residential');
        expect(estimate.bands.map((band) => band.tax)).toEqual([0, 2_000, 1_250]);
    });

    it('charges nothing up to £150,000', () => {
        expect(calculateStampDuty({ price: 150_000, propertyType: 'non-residential' }).stampDuty).toBe(0);
    });

    it('ignores buyer reliefs and surcharges', () => {
        const plain = calculateStampDuty({ price: 900_000, propertyType: 'non-residential' }).stampDuty;
        const loaded = calculateStampDuty({
            price: 900_000,
            propertyType: 'non-residential',
            buyer: 'additional-property',
            nonUkResident: true,
        }).stampDuty;
        expect(loaded).toBe(plain);
    });

    it('taxes six or more dwellings at non-residential rates', () => {
        expect(calculateStampDuty({ price: 2_000_000, dwellings: 5 }).propertyType).toBe('residential');
        const six = calculateStampDuty({ price: 2_000_000, dwellings: 6, buyer: 'additional-property' });
        expect(six.propertyType).toBe('non-residential');
        expect(six.stampDuty).toBe(2_000 + 87_500);
    });

    it('leaves residential results unchanged and labelled', () => {
        const estimate = calculateStampDuty({ price: 295_000 });
        expect(estimate.stampDuty).toBe(4_750);
        expect(estimate.propertyType).toBe('residential');
    });

    it('rejects bad input', () => {
        expect(() => calculateStampDuty({ price: 1, propertyType: 'farm' as never })).toThrow(RangeError);
        expect(() => calculateStampDuty({ price: 1, dwellings: 0 })).toThrow(RangeError);
        expect(() => calculateStampDuty({ price: 1, dwellings: 1.5 })).toThrow(RangeError);
    });
});
