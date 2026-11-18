import { describe, expect, it } from 'vitest';

import {
    calculateCompanyStampDuty,
    calculateLeaseStampDuty,
    calculateRentNpv,
    calculateStampDuty,
    highestRent,
    resolvePropertyType,
    stampDutyFor,
} from '../src';

/*
 * Regression tests for the tax review of 18 November 2026. Each uses the input that showed the
 * defect; the comment gives what it used to return.
 */

describe('two to five dwellings in one transaction (Schedule 4ZA paragraph 5)', () => {
    it('charges the higher rates whoever the buyer is, and reports the buyer applied', () => {
        // Was £35,000 at standard rates, with buyer "home-mover".
        const estimate = calculateStampDuty({ price: 900_000, dwellings: 3 });
        expect(estimate).toMatchObject({
            stampDuty: 80_000,
            buyer: 'additional-property',
            propertyType: 'residential',
        });
        expect(estimate.bands.map((band) => band.rate)).toEqual([5, 7, 10, 15, 17]);
        // Was £0 with first-time buyer relief.
        const firstTime = calculateStampDuty({ price: 300_000, dwellings: 2, buyer: 'first-time-buyer' });
        expect(firstTime).toMatchObject({ stampDuty: 20_000, buyer: 'additional-property' });
        const nonUk = calculateStampDuty({ price: 300_000, dwellings: 5, nonUkResident: true });
        expect(nonUk.stampDuty).toBe(26_000);
    });

    it('starts at £40,000 and stops at six dwellings', () => {
        expect(calculateStampDuty({ price: 39_999, dwellings: 2 })).toMatchObject({
            stampDuty: 0,
            buyer: 'home-mover',
        });
        expect(calculateStampDuty({ price: 40_000, dwellings: 2 })).toMatchObject({
            stampDuty: 2_000,
            buyer: 'additional-property',
        });
        const six = calculateStampDuty({ price: 900_000, dwellings: 6, buyer: 'first-time-buyer' });
        expect(six).toMatchObject({ stampDuty: 34_500, buyer: 'first-time-buyer', propertyType: 'non-residential' });
        expect(calculateStampDuty({ price: 900_000, dwellings: 1 }).stampDuty).toBe(35_000);
    });

    it('applies to the premium of a lease of more than seven years, with a note', () => {
        const lease = calculateLeaseStampDuty({ premium: 300_000, rent: 0, termYears: 99, dwellings: 2 });
        expect(lease.premium).toMatchObject({ stampDuty: 20_000, buyer: 'additional-property' });
        expect(lease.applied).toMatchObject({ buyer: 'additional-property', additionalPropertySurcharge: true });
        expect(lease.notes).toEqual([expect.stringMatching(/^Buying 2 dwellings .* subsidiary-dwelling exception/)]);

        const firstTime = { premium: 300_000, rent: 0, termYears: 99, buyer: 'first-time-buyer' } as const;
        expect(calculateLeaseStampDuty(firstTime).applied.firstTimeBuyerRelief).toBe(true);
        expect(calculateLeaseStampDuty({ ...firstTime, dwellings: 2 }).applied).toMatchObject({
            firstTimeBuyerRelief: false,
            additionalPropertySurcharge: true,
        });

        const short = calculateLeaseStampDuty({ premium: 300_000, rent: 0, termYears: 7, dwellings: 2 });
        expect(short).toMatchObject({ stampDuty: 5_000, notes: [], applied: { buyer: 'home-mover' } });
        const small = calculateLeaseStampDuty({ premium: 39_999, rent: 0, termYears: 99, dwellings: 2 });
        expect(small).toMatchObject({ stampDuty: 0, notes: [], applied: { additionalPropertySurcharge: false } });
    });

    it('leaves a company purchase as it was: the higher rates already applied', () => {
        const two = calculateCompanyStampDuty({ price: 600_000, dwellings: 2 });
        expect(two.stampDuty).toBe(calculateStampDuty({ price: 600_000, buyer: 'additional-property' }).stampDuty);
    });
});

describe('one validator for every entry point', () => {
    const calculators = [
        (extra: object) => calculateStampDuty({ price: 300_000, ...extra }),
        (extra: object) => calculateCompanyStampDuty({ price: 300_000, ...extra }),
        (extra: object) => calculateLeaseStampDuty({ premium: 300_000, rent: 1_000, termYears: 50, ...extra }),
    ];

    it('rejects a nonUkResident that is not a boolean: "false" used to add the 2-point surcharge', () => {
        for (const calculate of calculators) {
            for (const nonUkResident of ['false', 'yes', 1, 0, null])
                expect(() => calculate({ nonUkResident })).toThrow(/Invalid non-UK resident flag/);
            expect(() => calculate({ nonUkResident: undefined })).not.toThrow();
        }
        expect(calculateStampDuty({ price: 300_000, nonUkResident: false }).stampDuty).toBe(5_000);
        expect(calculateStampDuty({ price: 300_000, nonUkResident: true }).stampDuty).toBe(11_000);
    });

    it('rejects the same buyer, property type and dwellings everywhere', () => {
        for (const calculate of calculators) {
            expect(() => calculate({ propertyType: 'land' })).toThrow(/Invalid property type/);
            expect(() => calculate({ propertyType: null })).toThrow(RangeError);
            for (const dwellings of [0, 1.5, '6', null, Number.NaN])
                expect(() => calculate({ dwellings })).toThrow(/Invalid number of dwellings/);
        }
        expect(() => calculateStampDuty({ price: 1, buyer: null as never })).toThrow(/Invalid buyer type/);
        expect(() => calculateLeaseStampDuty({ premium: 1, rent: 1, termYears: 9, buyer: 'x' as never })).toThrow(
            /Invalid buyer type/,
        );
        expect(() => resolvePropertyType({ dwellings: 0 })).toThrow(RangeError);
        expect(resolvePropertyType()).toBe('residential');
    });

    it('throws a RangeError, not a TypeError, for a missing input object or rent', () => {
        for (const input of [undefined, null, 'x'])
            for (const calculate of [
                calculateStampDuty,
                calculateCompanyStampDuty,
                calculateLeaseStampDuty,
                calculateRentNpv,
            ])
                expect(() => calculate(input as never)).toThrow(RangeError);
        for (const rent of [null, undefined, '1000', {}, [1_000, undefined], [1_000, '2']])
            expect(() => calculateRentNpv({ rent: rent as never, termYears: 10 })).toThrow(RangeError);
        expect(() => highestRent(null as never)).toThrow(RangeError);
    });

    it('rejects amounts above Number.MAX_SAFE_INTEGER: they used to return Infinity and "£NaN"', () => {
        for (const amount of [Number.MAX_VALUE, 1e21, 1e308, Number.MAX_SAFE_INTEGER + 1]) {
            expect(() => calculateStampDuty({ price: amount })).toThrow(/Invalid stamp duty price/);
            expect(() => calculateCompanyStampDuty({ price: amount })).toThrow(RangeError);
            expect(() => calculateLeaseStampDuty({ premium: amount, rent: 1, termYears: 9 })).toThrow(/lease premium/);
            expect(() => calculateRentNpv({ rent: amount, termYears: 99 })).toThrow(/Invalid rent/);
            expect(stampDutyFor(amount)).toBeNull();
        }
        // Prices above MAX_PRICE are still accepted, as the legacy API accepts them.
        const largest = calculateStampDuty({ price: Number.MAX_SAFE_INTEGER });
        expect(Number.isFinite(largest.stampDuty)).toBe(true);
        expect(largest.formatted.price).toBe('£9,007,199,254,740,991');
    });
});

describe('part-year rent', () => {
    it('matches the HMRC manual example (SDLTM13090): 3 years and 123 days at £75,000 is £232,146', () => {
        // Was £232,147: HMRC rounds the part-year rent down to £25,273 before discounting.
        expect(calculateRentNpv({ rent: 75_000, termYears: 3 + 123 / 365 })).toBe(232_146);
    });

    it('does not lose a pound of part-year rent to floating point', () => {
        // 10.1 - 10 is 0.0999999999999996, so a tenth of £10,000 must still be £1,000.
        const whole = calculateRentNpv({ rent: 10_000, termYears: 10 });
        expect(calculateRentNpv({ rent: 10_000, termYears: 10.1 })).toBe(
            Math.floor(whole + 1_000 / 1.035 ** 11 + 0.05),
        );
    });
});

describe('smaller corrections', () => {
    it('accounts for a fractional price just under £40,000 in the breakdown', () => {
        // The single band used to end at £39,999, so 50p of the price went missing.
        for (const buyer of ['home-mover', 'first-time-buyer', 'additional-property'] as const)
            for (const nonUkResident of [false, true]) {
                const { bands, stampDuty } = calculateStampDuty({ price: 39_999.5, buyer, nonUkResident });
                expect(bands).toHaveLength(1);
                expect(bands[0]).toMatchObject({ from: 0, to: 40_000, rate: 0, taxable: 39_999.5, tax: 0 });
                expect(stampDuty).toBe(0);
            }
        const lease = calculateLeaseStampDuty({
            premium: 39_999.5,
            rent: 0,
            termYears: 50,
            buyer: 'additional-property',
        });
        expect(lease.premium.bands[0]?.taxable).toBe(39_999.5);
    });

    it('does not call a company an additional-property buyer when no higher rates were charged', () => {
        // Was buyer "additional-property" with applied.higherRates false.
        const under = calculateCompanyStampDuty({ price: 39_999, nonUkResident: true });
        expect(under).toMatchObject({ buyer: 'home-mover', stampDuty: 0, applied: { higherRates: false } });
        expect(under.bands[0]?.taxable).toBe(39_999);
        expect(calculateCompanyStampDuty({ price: 40_000 })).toMatchObject({
            buyer: 'additional-property',
            applied: { higherRates: true },
        });
    });

    it('still charges no higher rates on a lease premium under £40,000, whatever the rent (open question)', () => {
        const lease = calculateLeaseStampDuty({
            premium: 30_000,
            rent: 50_000,
            termYears: 99,
            buyer: 'additional-property',
        });
        expect(lease.premium.stampDuty).toBe(0);
        expect(lease.applied.additionalPropertySurcharge).toBe(false);
    });
});
