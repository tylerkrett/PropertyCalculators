import { describe, expect, it } from 'vitest';

import { calculateLbtt, calculateLtt, calculatePropertyTax, type PropertyTaxInput } from '../src/land-tax/index';
import { calculateStampDuty } from '../src/stamp-duty/estimate';

/*
 * Regression tests for the tax review of 18 November 2026: how many dwellings are bought, mixed
 * use in Scotland, the notes on English results, and input validation shared by every country.
 */

const ANNEXE = /subsidiary-dwelling exception/;

describe('two to five dwellings in one transaction', () => {
    it('charges the higher rates in England and Northern Ireland whoever the buyer is', () => {
        // Was £35,000 at standard rates.
        const estimate = calculatePropertyTax({ price: 900_000, dwellings: 3 });
        expect(estimate).toMatchObject({ total: 80_000, buyer: 'additional-property', propertyType: 'residential' });
        expect(estimate.notes).toEqual([expect.stringMatching(/^Buying 3 dwellings .* higher rates for additional/)]);
        expect(estimate.notes[0]).toMatch(ANNEXE);
        expect(estimate.total).toBe(calculateStampDuty({ price: 900_000, buyer: 'additional-property' }).stampDuty);
        expect(calculatePropertyTax({ country: 'northern-ireland', price: 900_000, dwellings: 5 }).total).toBe(80_000);
    });

    it('drops first-time buyer relief: £300,000 for two dwellings was £0', () => {
        const input = { price: 300_000, dwellings: 2, buyer: 'first-time-buyer' } as const;
        expect(calculatePropertyTax(input)).toMatchObject({ total: 20_000, buyer: 'additional-property' });
        expect(calculatePropertyTax(input).notes[0]).toMatch(/first-time buyer relief does not apply/);
        // Scotland was £4,000 with the relief: now £4,600 of band tax plus £24,000 of ADS.
        const scotland = calculateLbtt(input);
        expect(scotland).toMatchObject({ bandTax: 4_600, total: 28_600, buyer: 'additional-property' });
        expect(scotland.supplement?.amount).toBe(24_000);
    });

    it('charges the Additional Dwelling Supplement in Scotland: £900,000 for three was £66,350', () => {
        const estimate = calculateLbtt({ price: 900_000, dwellings: 3 });
        expect(estimate).toMatchObject({ total: 138_350, buyer: 'additional-property' });
        expect(estimate.total).toBe(calculateLbtt({ price: 900_000, buyer: 'additional-property' }).total);
        expect(estimate.notes).toHaveLength(2);
        expect(estimate.notes[0]).toMatch(/Additional Dwelling Supplement is charged/);
        expect(estimate.notes[0]).toMatch(ANNEXE);
    });

    it('charges the higher residential rates in Wales: £900,000 for three was £51,750', () => {
        const estimate = calculateLtt({ price: 900_000, dwellings: 3, buyer: 'first-time-buyer' });
        expect(estimate).toMatchObject({ total: 96_200, buyer: 'additional-property' });
        expect(estimate.notes).toEqual([expect.stringMatching(ANNEXE)]);
    });

    it('says nothing new when the buyer already pays as an additional property, or under £40,000', () => {
        for (const country of ['england', 'scotland', 'wales'] as const) {
            const input = { country, price: 600_000, buyer: 'additional-property' } as const;
            expect(calculatePropertyTax({ ...input, dwellings: 2 })).toEqual(calculatePropertyTax(input));
            const small = calculatePropertyTax({ country, price: 39_999, dwellings: 2, buyer: 'first-time-buyer' });
            expect(small).toMatchObject({ total: 0, buyer: 'first-time-buyer' });
        }
    });
});

describe('six or more dwellings', () => {
    it('uses non-residential rates in Wales: £900,000 was £51,750, which matched neither option', () => {
        const estimate = calculateLtt({ price: 900_000, dwellings: 6 });
        expect(estimate).toMatchObject({ total: 32_750, propertyType: 'non-residential', buyer: 'home-mover' });
        expect(estimate.total).toBe(calculateLtt({ price: 900_000, propertyType: 'non-residential' }).total);
        expect(estimate.notes).toEqual([
            expect.stringMatching(/higher residential rates with multiple dwellings relief/),
        ]);
        expect(calculateLtt({ price: 900_000, dwellings: 6, buyer: 'additional-property' }).total).toBe(32_750);
    });

    it('describes the Scottish supplement as relieved, not as never charged', () => {
        const estimate = calculateLbtt({ price: 900_000, dwellings: 6, buyer: 'additional-property' });
        expect(estimate).toMatchObject({ total: 33_500, supplement: null, propertyType: 'non-residential' });
        expect(estimate.notes[1]).toMatch(/^Full relief from the Additional Dwelling Supplement/);
    });
});

describe('Scotland: mixed use bought as an additional property', () => {
    const mixed = { price: 400_000, buyer: 'additional-property', propertyType: 'non-residential' } as const;

    it('warns that the supplement is still due on the dwelling when its value is not given', () => {
        const estimate = calculateLbtt(mixed);
        expect(estimate).toMatchObject({ bandTax: 8_500, total: 8_500, supplement: null });
        expect(estimate.notes).toEqual([
            'The Additional Dwelling Supplement is still due on any dwelling included in a mixed-use purchase: 8% of the part of the price that is for the dwelling, when that part is £40,000 or more. This estimate does not include it.',
        ]);
    });

    it('charges 8% of dwellingValue when it is £40,000 or more (revenue.scot LBTT10019)', () => {
        const estimate = calculateLbtt({ ...mixed, dwellingValue: 150_000 });
        expect(estimate).toMatchObject({ bandTax: 8_500, total: 20_500, propertyType: 'non-residential' });
        expect(estimate.supplement).toMatchObject({ name: 'ADS', rate: 8, amount: 12_000 });
        expect(estimate.notes).toEqual([
            expect.stringContaining('8% of the £150,000 of the price that is for the dwelling'),
        ]);
        expect(calculateLbtt({ ...mixed, dwellingValue: 40_000 }).supplement?.amount).toBe(3_200);
        expect(calculatePropertyTax({ country: 'scotland', ...mixed, dwellingValue: 150_000 }).total).toBe(20_500);
    });

    it('charges nothing on a dwelling part under £40,000, and says why', () => {
        const estimate = calculateLbtt({ ...mixed, dwellingValue: 39_999 });
        expect(estimate).toMatchObject({ total: 8_500, supplement: null });
        expect(estimate.notes).toEqual([expect.stringContaining('for the dwelling is under £40,000')]);
    });

    it('ignores dwellingValue where it has no effect, and rejects a bad one', () => {
        expect(
            calculateLbtt({ price: 400_000, propertyType: 'non-residential', dwellingValue: 150_000 }).supplement,
        ).toBeNull();
        const residential = { price: 400_000, buyer: 'additional-property', dwellingValue: 150_000 } as const;
        expect(calculateLbtt(residential).supplement?.amount).toBe(32_000);
        for (const country of ['england', 'wales'] as const)
            expect(calculatePropertyTax({ country, ...mixed, dwellingValue: 150_000 }).supplement).toBeNull();
        for (const dwellingValue of [-1, Number.NaN, 400_001, '150000', null])
            expect(() => calculateLbtt({ ...mixed, dwellingValue: dwellingValue as never })).toThrow(RangeError);
    });
});

describe('England and Northern Ireland explain themselves like the other countries', () => {
    const notes = (input: PropertyTaxInput) => calculatePropertyTax(input).notes;

    it('notes every relief or surcharge that non-residential rates switch off', () => {
        expect(notes({ price: 900_000, dwellings: 6, buyer: 'first-time-buyer', nonUkResident: true })).toEqual([
            'Six or more dwellings bought in one transaction are taxed at non-residential rates in England and Northern Ireland.',
            'First-time buyer relief does not apply at non-residential rates.',
            'The non-UK resident surcharge is not charged at non-residential rates.',
        ]);
        expect(notes({ price: 900_000, propertyType: 'non-residential', buyer: 'additional-property' })).toEqual([
            'The higher rates for additional dwellings are not charged at non-residential rates.',
        ]);
    });

    it('notes the £40,000 and £500,000 limits', () => {
        expect(notes({ price: 39_999, buyer: 'additional-property', nonUkResident: true })).toEqual([
            'The higher rates for additional dwellings are not charged on purchases under £40,000.',
            'The non-UK resident surcharge is not charged on purchases under £40,000.',
        ]);
        expect(notes({ price: 500_001, buyer: 'first-time-buyer' })).toEqual([
            'First-time buyer relief is not available above £500,000, so the standard rates apply.',
        ]);
        expect(notes({ price: 500_000, buyer: 'first-time-buyer' })).toEqual([]);
        expect(notes({ price: 3_250_000, buyer: 'additional-property', nonUkResident: true })).toEqual([]);
    });
});

describe('one validator for every country', () => {
    const countries = ['england', 'northern-ireland', 'scotland', 'wales'] as const;

    it('rejects a non-boolean nonUkResident everywhere: "false" used to add or note a surcharge', () => {
        for (const country of countries)
            for (const nonUkResident of ['false', 1, null])
                expect(() =>
                    calculatePropertyTax({ country, price: 300_000, nonUkResident: nonUkResident as never }),
                ).toThrow(/Invalid non-UK resident flag/);
        expect(calculatePropertyTax({ price: 300_000, nonUkResident: true }).nonUkResident).toBe(true);
        expect(calculatePropertyTax({ price: 300_000, nonUkResident: undefined }).total).toBe(5_000);
    });

    it('throws a RangeError, not a TypeError, for a missing input object', () => {
        for (const input of [undefined, null, 'x', 5])
            for (const calculate of [calculatePropertyTax, calculateLbtt, calculateLtt])
                expect(() => calculate(input as never)).toThrow(RangeError);
    });

    it('rejects amounts above Number.MAX_SAFE_INTEGER: they used to return Infinity and "£NaN"', () => {
        for (const country of countries) {
            for (const price of [Number.MAX_VALUE, 1e21, Number.MAX_SAFE_INTEGER + 1])
                expect(() => calculatePropertyTax({ country, price, buyer: 'additional-property' })).toThrow(
                    RangeError,
                );
            const largest = calculatePropertyTax({ country, price: Number.MAX_SAFE_INTEGER });
            expect(Number.isFinite(largest.total)).toBe(true);
            expect(largest.formatted.price).toBe('£9,007,199,254,740,991');
        }
    });
});
