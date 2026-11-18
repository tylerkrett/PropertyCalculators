import { describe, expect, it } from 'vitest';

import { calculateLeaseStampDuty, calculateRentNpv, calculateStampDuty, getLeaseStampDutyTable } from '../src';

describe('rent net present value', () => {
    it('matches the HMRC manual example (SDLTM13080): £57,192', () => {
        expect(calculateRentNpv({ rent: [4_000, 5_000, 6_000, 7_000, 8_000], termYears: 10 })).toBe(57_192);
    });

    it('discounts a single year at 3.5%', () => {
        expect(calculateRentNpv({ rent: 1_035, termYears: 1 })).toBe(1_000);
    });

    it('repeats the last rent given and uses the highest after year five', () => {
        const short = calculateRentNpv({ rent: [1_000, 2_000], termYears: 8 });
        const full = calculateRentNpv({ rent: [1_000, 2_000, 2_000, 2_000, 2_000], termYears: 8 });
        expect(short).toBe(full);
        // A dip in year five does not lower later years: the highest of the five carries on.
        const dip = calculateRentNpv({ rent: [5_000, 5_000, 5_000, 5_000, 1_000], termYears: 6 });
        const flat = calculateRentNpv({ rent: 5_000, termYears: 6 });
        expect(flat - dip).toBe(Math.round(4_000 / 1.035 ** 5));
    });

    it('counts a final part year in proportion', () => {
        const ten = calculateRentNpv({ rent: 10_000, termYears: 10 });
        const eleven = calculateRentNpv({ rent: 10_000, termYears: 11 });
        const half = calculateRentNpv({ rent: 10_000, termYears: 10.5 });
        expect(half).toBeGreaterThan(ten);
        expect(half).toBeLessThan(eleven);
        expect(Math.abs(half - (ten + eleven) / 2)).toBeLessThanOrEqual(1);
    });

    it('rejects bad input', () => {
        expect(() => calculateRentNpv({ rent: -1, termYears: 10 })).toThrow(RangeError);
        expect(() => calculateRentNpv({ rent: [], termYears: 10 })).toThrow(RangeError);
        expect(() => calculateRentNpv({ rent: [1, 2, 3, 4, 5, 6], termYears: 10 })).toThrow(RangeError);
        expect(() => calculateRentNpv({ rent: 100, termYears: 0 })).toThrow(RangeError);
        expect(() => calculateRentNpv({ rent: 100, termYears: Number.NaN })).toThrow(RangeError);
    });
});

describe('new lease', () => {
    it('matches the GOV.UK premium example: £275,000 is £3,750', () => {
        const lease = calculateLeaseStampDuty({ premium: 275_000, rent: 250, termYears: 125 });
        expect(lease.premium.stampDuty).toBe(3_750);
        expect(lease.rent.tax).toBe(0);
        expect(lease.stampDuty).toBe(3_750);
        expect(lease.notes).toEqual([]);
    });

    it('charges 1% on rent value above £125,000', () => {
        // A high ground rent on a long lease.
        const lease = calculateLeaseStampDuty({ premium: 275_000, rent: 10_000, termYears: 99 });
        expect(lease.rent.npv).toBeGreaterThan(125_000);
        expect(lease.rent.tax).toBe(Math.floor((lease.rent.npv - 125_000) / 100));
        expect(lease.stampDuty).toBe(3_750 + lease.rent.tax);
        expect(lease.formatted.stampDuty).toBe(`£${(3_750 + lease.rent.tax).toLocaleString('en-GB')}`);
    });

    it('matches the GOV.UK non-residential rent example: value of £5,100,000 is £50,500', () => {
        // Find a rent that gives an NPV of at least £5.1m, then check the banding on that NPV.
        const lease = calculateLeaseStampDuty({
            premium: 280_000,
            rent: 600_000,
            termYears: 10,
            propertyType: 'non-residential',
        });
        expect(lease.premium.stampDuty).toBe(3_500);
        const npv = lease.rent.npv;
        const expected =
            Math.floor((Math.min(npv, 5_000_000) - 150_000) / 100) +
            Math.floor((Math.max(npv - 5_000_000, 0) * 2) / 100);
        expect(lease.rent.tax).toBe(expected);
        expect(lease.rent.bands.map((band) => band.rate)).toEqual([0, 1, 2]);
    });

    it('keeps the additional-property surcharge off the rent', () => {
        const lease = calculateLeaseStampDuty({
            premium: 400_000,
            rent: 10_000,
            termYears: 99,
            buyer: 'additional-property',
        });
        expect(lease.premium.stampDuty).toBe(
            calculateStampDuty({ price: 400_000, buyer: 'additional-property' }).stampDuty,
        );
        expect(lease.rent.bands.map((band) => band.rate)).toEqual([0, 1]);
        expect(lease.applied.additionalPropertySurcharge).toBe(true);
    });

    it('adds the non-UK resident surcharge to premium and rent', () => {
        const lease = calculateLeaseStampDuty({ premium: 400_000, rent: 10_000, termYears: 99, nonUkResident: true });
        expect(lease.premium.stampDuty).toBe(calculateStampDuty({ price: 400_000, nonUkResident: true }).stampDuty);
        expect(lease.rent.bands.map((band) => band.rate)).toEqual([2, 3]);
        expect(lease.applied.nonUkResidentSurcharge).toBe(true);
    });

    it('applies the non-UK surcharge to a small premium when the rent is £1,000 or more', () => {
        const lease = calculateLeaseStampDuty({ premium: 20_000, rent: 1_000, termYears: 30, nonUkResident: true });
        expect(lease.premium.stampDuty).toBe(400);
        expect(lease.applied.nonUkResidentSurcharge).toBe(true);

        const none = calculateLeaseStampDuty({ premium: 20_000, rent: 999, termYears: 30, nonUkResident: true });
        expect(none.stampDuty).toBe(0);
        expect(none.applied.nonUkResidentSurcharge).toBe(false);
        expect(none.notes).toHaveLength(1);
    });

    it('drops both surcharges for a lease of seven years or fewer', () => {
        const lease = calculateLeaseStampDuty({
            premium: 400_000,
            rent: 30_000,
            termYears: 7,
            buyer: 'additional-property',
            nonUkResident: true,
        });
        expect(lease.premium.stampDuty).toBe(calculateStampDuty({ price: 400_000 }).stampDuty);
        expect(lease.rent.bands.map((band) => band.rate)).toEqual([0, 1]);
        expect(lease.applied).toMatchObject({
            buyer: 'home-mover',
            additionalPropertySurcharge: false,
            nonUkResidentSurcharge: false,
        });
        expect(lease.notes).toHaveLength(2);
    });

    it('gives first-time buyer relief on the premium only, and only for 21 years or more', () => {
        const long = calculateLeaseStampDuty({
            premium: 400_000,
            rent: 10_000,
            termYears: 99,
            buyer: 'first-time-buyer',
        });
        expect(long.premium.stampDuty).toBe(5_000);
        expect(long.rent.bands.map((band) => [band.to, band.rate])).toEqual([
            [125_000, 0],
            [null, 1],
        ]);
        expect(long.applied.firstTimeBuyerRelief).toBe(true);

        const short = calculateLeaseStampDuty({
            premium: 400_000,
            rent: 10_000,
            termYears: 20,
            buyer: 'first-time-buyer',
        });
        expect(short.premium.stampDuty).toBe(10_000);
        expect(short.applied.firstTimeBuyerRelief).toBe(false);
        expect(short.notes).toHaveLength(1);
    });

    it('is plain JSON and lays out as two tables', () => {
        const lease = calculateLeaseStampDuty({ premium: 600_000, rent: [8_000, 9_000], termYears: 150 });
        expect(JSON.parse(JSON.stringify(lease))).toEqual(lease);

        const table = getLeaseStampDutyTable(lease);
        expect(table.summary.map((row) => row.key)).toEqual(['premium', 'npv', 'premiumTax', 'rentTax', 'stampDuty']);
        expect(table.premium.rows).toHaveLength(5);
        expect(table.rent.rows).toHaveLength(2);
        expect(table.rent.totals.tax).toBe(lease.formatted.rentTax);
    });

    it('rejects bad input', () => {
        expect(() => calculateLeaseStampDuty({ premium: -1, rent: 1, termYears: 10 })).toThrow(RangeError);
        expect(() => calculateLeaseStampDuty({ premium: 1, rent: 1, termYears: 10, buyer: 'x' as never })).toThrow(
            RangeError,
        );
    });
});
