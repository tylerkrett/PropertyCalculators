import { describe, expect, it } from 'vitest';

import { calculateStampDuty } from '../src/stamp-duty/estimate';
import {
    COMPANY_FLAT_RATE,
    COMPANY_FLAT_RATE_EFFECTIVE_FROM,
    COMPANY_FLAT_RATE_THRESHOLD,
    COMPANY_RELIEFS,
    type CompanyStampDutyInput,
    calculateCompanyStampDuty,
    isCompanyRelief,
} from '../src/stamp-duty/company';

/** The shared `StampDutyEstimate` part of a company result. */
const estimateOf = (input: CompanyStampDutyInput) => {
    const { applied: _applied, notes: _notes, ...estimate } = calculateCompanyStampDuty(input);
    return estimate;
};

describe('constants and reliefs', () => {
    it('states the rate, threshold and date', () => {
        expect(COMPANY_FLAT_RATE).toBe(17);
        expect(COMPANY_FLAT_RATE_THRESHOLD).toBe(500_000);
        expect(COMPANY_FLAT_RATE_EFFECTIVE_FROM).toBe('2024-10-31');
    });

    it('lists the seven reliefs and guards them', () => {
        expect(COMPANY_RELIEFS).toHaveLength(7);
        expect(new Set(COMPANY_RELIEFS.map((relief) => relief.value)).size).toBe(7);
        for (const relief of COMPANY_RELIEFS) expect(isCompanyRelief(relief.value)).toBe(true);
        expect(isCompanyRelief('holiday-let')).toBe(false);
        expect(isCompanyRelief(null)).toBe(false);
    });
});

describe('flat rate', () => {
    it('does not apply at exactly £500,000: higher rates, £40,000', () => {
        const result = calculateCompanyStampDuty({ price: 500_000 });
        expect(result.stampDuty).toBe(40_000);
        expect(result.applied).toEqual({
            flatRate: false,
            relief: null,
            higherRates: true,
            nonUkResidentSurcharge: false,
        });
        expect(result.bands.map((band) => band.rate)).toEqual([5, 7, 10, 15, 17]);
    });

    it('applies from £500,001: 17% of the whole price', () => {
        const result = calculateCompanyStampDuty({ price: 500_001 });
        expect(result.stampDuty).toBe(85_000); // 85,000.17 rounded down
        expect(result.applied).toEqual({
            flatRate: true,
            relief: null,
            higherRates: false,
            nonUkResidentSurcharge: false,
        });
        expect(result.bands).toHaveLength(1);
        expect(result.bands[0]).toMatchObject({ from: 0, to: null, rate: 17, taxable: 500_001, tax: 85_000 });
        expect(result.bands[0]?.formatted).toEqual({ range: '£0+', rate: '17%', taxable: '£500,001', tax: '£85,000' });
    });

    it.each([
        [750_000, 127_500],
        [1_000_000, 170_000],
        [2_500_000, 425_000],
        [999_999, 169_999],
    ])('charges 17%% of £%i: £%i', (price, expected) => {
        const result = calculateCompanyStampDuty({ price });
        expect(result.stampDuty).toBe(expected);
        expect(result.effectiveRate).toBeCloseTo(17, 3);
        expect(result.propertyType).toBe('residential');
    });

    it('formats the headline figures and explains itself', () => {
        const result = calculateCompanyStampDuty({ price: 1_000_000 });
        expect(result.formatted).toEqual({ price: '£1,000,000', stampDuty: '£170,000', effectiveRate: '17%' });
        expect(result.notes).toEqual([
            'A company buying a dwelling for more than £500,000 pays a flat 17% on the whole price.',
        ]);
    });
});

describe('reliefs', () => {
    it.each(COMPANY_RELIEFS.map((relief) => relief.value))('%s switches to the higher rates', (relief) => {
        const result = calculateCompanyStampDuty({ price: 1_000_000, relief });
        expect(result.applied).toEqual({ flatRate: false, relief, higherRates: true, nonUkResidentSurcharge: false });
        expect(result.stampDuty).toBe(93_750);
        expect(estimateOf({ price: 1_000_000, relief })).toEqual(
            calculateStampDuty({ price: 1_000_000, buyer: 'additional-property' }),
        );
        expect(result.notes[0]).toMatch(/^The flat 17% rate does not apply because a relief is claimed: /);
    });

    it('reports no relief when the price never reached the flat rate', () => {
        const result = calculateCompanyStampDuty({ price: 400_000, relief: 'farmhouse' });
        expect(result.applied.relief).toBeNull();
        expect(result.stampDuty).toBe(calculateCompanyStampDuty({ price: 400_000 }).stampDuty);
        expect(result.notes.some((note) => note.startsWith('The relief is not needed'))).toBe(true);
    });
});

describe('higher rates', () => {
    it.each([40_000, 125_000, 300_000, 500_000])('equal the additional-property estimate at £%i', (price) => {
        expect(estimateOf({ price })).toEqual(calculateStampDuty({ price, buyer: 'additional-property' }));
        expect(estimateOf({ price, nonUkResident: true })).toEqual(
            calculateStampDuty({ price, buyer: 'additional-property', nonUkResident: true }),
        );
    });

    it('matches the GOV.UK example: £300,000 is £20,000', () => {
        expect(calculateCompanyStampDuty({ price: 300_000 }).stampDuty).toBe(20_000);
    });

    it('charges nothing under £40,000', () => {
        const result = calculateCompanyStampDuty({ price: 39_999, nonUkResident: true });
        expect(result.stampDuty).toBe(0);
        expect(result.applied).toEqual({
            flatRate: false,
            relief: null,
            higherRates: false,
            nonUkResidentSurcharge: false,
        });
        expect(calculateCompanyStampDuty({ price: 40_000 }).stampDuty).toBe(2_000);
        expect(calculateCompanyStampDuty({ price: 0 }).effectiveRate).toBe(0);
    });
});

describe('non-UK resident company', () => {
    it('pays a flat 19% over £500,000', () => {
        const result = calculateCompanyStampDuty({ price: 1_000_000, nonUkResident: true });
        expect(result.stampDuty).toBe(190_000);
        expect(result.bands.map((band) => band.rate)).toEqual([19]);
        expect(result.applied).toEqual({
            flatRate: true,
            relief: null,
            higherRates: false,
            nonUkResidentSurcharge: true,
        });
        expect(result.notes).toHaveLength(2);
        expect(calculateCompanyStampDuty({ price: 500_001, nonUkResident: true }).stampDuty).toBe(95_000);
    });

    it('pays the higher rates plus 2 points when banded', () => {
        const result = calculateCompanyStampDuty({ price: 500_000, nonUkResident: true });
        expect(result.bands.map((band) => band.rate)).toEqual([7, 9, 12, 17, 19]);
        expect(result.stampDuty).toBe(50_000);
        expect(result.applied.nonUkResidentSurcharge).toBe(true);
        const relieved = calculateCompanyStampDuty({
            price: 1_000_000,
            nonUkResident: true,
            relief: 'property-rental-business',
        });
        expect(relieved.stampDuty).toBe(93_750 + 20_000);
    });
});

describe('non-residential and several dwellings', () => {
    it('uses ordinary non-residential rates, whatever the price', () => {
        const result = calculateCompanyStampDuty({
            price: 1_000_000,
            propertyType: 'non-residential',
            nonUkResident: true,
        });
        expect(result.stampDuty).toBe(39_500);
        expect(result.propertyType).toBe('non-residential');
        expect(result.applied).toEqual({
            flatRate: false,
            relief: null,
            higherRates: false,
            nonUkResidentSurcharge: false,
        });
        expect(result.stampDuty).toBe(
            calculateStampDuty({ price: 1_000_000, propertyType: 'non-residential' }).stampDuty,
        );
    });

    it('tests the flat rate against the price per dwelling', () => {
        const two = calculateCompanyStampDuty({ price: 1_000_000, dwellings: 2 });
        expect(two.applied.flatRate).toBe(false);
        expect(two.stampDuty).toBe(93_750);
        expect(two.notes.at(-1)).toMatch(/split equally between the 2 dwellings/);
        expect(calculateCompanyStampDuty({ price: 1_000_002, dwellings: 2 }).applied.flatRate).toBe(true);
    });

    it('charges six or more dwellings at non-residential rates unless each is over the threshold', () => {
        const six = calculateCompanyStampDuty({ price: 3_000_000, dwellings: 6 });
        expect(six.propertyType).toBe('non-residential');
        expect(six.stampDuty).toBe(calculateStampDuty({ price: 3_000_000, dwellings: 6 }).stampDuty);
        const dear = calculateCompanyStampDuty({ price: 6_000_000, dwellings: 6 });
        expect(dear.applied.flatRate).toBe(true);
        expect(dear.propertyType).toBe('residential');
        expect(dear.stampDuty).toBe(1_020_000);
    });
});

describe('output and input', () => {
    it('survives a JSON round trip', () => {
        for (const input of [
            { price: 750_000 },
            { price: 450_000, nonUkResident: true },
            { price: 900_000, relief: 'farmhouse' },
        ] satisfies CompanyStampDutyInput[]) {
            const result = calculateCompanyStampDuty(input);
            expect(JSON.parse(JSON.stringify(result))).toEqual(result);
        }
    });

    it('rejects bad input', () => {
        const bad = (input: unknown) => () => calculateCompanyStampDuty(input as CompanyStampDutyInput);
        expect(bad({ price: -1 })).toThrow(RangeError);
        expect(bad({ price: Number.NaN })).toThrow(RangeError);
        expect(bad({ price: Infinity })).toThrow(RangeError);
        expect(bad({ price: '600000' })).toThrow(RangeError);
        expect(bad({ price: 600_000, relief: 'holiday-let' })).toThrow(RangeError);
        expect(bad({ price: 600_000, nonUkResident: 'yes' })).toThrow(RangeError);
        expect(bad({ price: 600_000, propertyType: 'land' })).toThrow(RangeError);
        expect(bad({ price: 600_000, dwellings: 0 })).toThrow(RangeError);
        expect(bad({ price: 600_000, dwellings: 1.5 })).toThrow(RangeError);
    });
});
