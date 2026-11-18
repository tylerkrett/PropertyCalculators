import { describe, expect, it } from 'vitest';

import {
    calculateLbtt,
    calculateLtt,
    calculatePropertyTax,
    COUNTRIES,
    isCountry,
    LBTT_ADS_RATE,
    LBTT_BAND_TABLES,
    LBTT_EFFECTIVE_FROM,
    LBTT_RATES_EFFECTIVE_FROM,
    LTT_BAND_TABLES,
    LTT_EFFECTIVE_FROM,
    LTT_RATES_EFFECTIVE_FROM,
    type PropertyTaxInput,
} from '../src/land-tax/index';
import { calculateStampDuty } from '../src/stamp-duty/estimate';

type Options = Omit<PropertyTaxInput, 'price'>;
const lbtt = (price: number, options: Options = {}) => calculateLbtt({ price, ...options }).total;
const ltt = (price: number, options: Options = {}) => calculateLtt({ price, ...options }).total;
/** Checks a `{ price: total }` map against a calculator. */
const expectTotals = (tax: (price: number) => number, totals: Record<number, number>) => {
    for (const [price, total] of Object.entries(totals)) expect([price, tax(Number(price))]).toEqual([price, total]);
};
const additionalProperty = { buyer: 'additional-property' } as const;
const nonResidentialProperty = { propertyType: 'non-residential' } as const;

describe('calculateLbtt (Scotland)', () => {
    it('matches the worked examples on revenue.scot "Residential property"', () => {
        expectTotals(lbtt, { 135_000: 0, 235_000: 1_800, 875_000: 63_350 });
    });

    it('returns numbers, display strings and the breakdown for the revenue.scot £875,000 example', () => {
        const estimate = calculateLbtt({ price: 875_000 });
        expect(estimate).toMatchObject({
            country: 'scotland',
            tax: 'LBTT',
            price: 875_000,
            buyer: 'home-mover',
            propertyType: 'residential',
            bandTax: 63_350,
            supplement: null,
            total: 63_350,
            notes: [],
            formatted: { price: '£875,000', bandTax: '£63,350', total: '£63,350', effectiveRate: '7.24%' },
        });
        expect(estimate.bands.map((band) => band.formatted)).toEqual([
            { range: '£0 – £145,000', rate: '0%', taxable: '£145,000', tax: '£0' },
            { range: '£145,001 – £250,000', rate: '2%', taxable: '£105,000', tax: '£2,100' },
            { range: '£250,001 – £325,000', rate: '5%', taxable: '£75,000', tax: '£3,750' },
            { range: '£325,001 – £750,000', rate: '10%', taxable: '£425,000', tax: '£42,500' },
            { range: '£750,001+', rate: '12%', taxable: '£125,000', tax: '£15,000' },
        ]);
    });

    it('charges each residential band from its edge, rounding down to the pound', () => {
        expectTotals(lbtt, { 0: 0, 145_000: 0, 145_049: 0, 145_050: 1, 250_000: 2_100, 250_020: 2_101 });
        expectTotals(lbtt, { 325_000: 5_850, 325_010: 5_851, 750_000: 48_350, 750_100: 48_362, 1_000_000: 78_350 });
    });

    it('gives first-time buyers a £175,000 nil band, as in revenue.scot LBTT3048 (£175,000 and £250,000)', () => {
        const firstTimeBuyer = (price: number) => lbtt(price, { buyer: 'first-time-buyer' });
        expectTotals(firstTimeBuyer, { 150_000: 0, 175_000: 0, 175_050: 1, 250_000: 1_500, 875_000: 62_750 });
        for (const price of [175_000, 250_000, 325_000, 750_000, 2_000_000])
            expect(lbtt(price) - firstTimeBuyer(price)).toBe(600);
    });

    it('reports the Additional Dwelling Supplement as its own line on the whole price', () => {
        const estimate = calculateLbtt({ price: 300_000, buyer: 'additional-property' });
        expect(estimate).toMatchObject({ bandTax: 4_600, total: 28_600 });
        const formatted = { rate: '8%', amount: '£24,000' };
        const ads = { name: 'ADS', label: 'Additional Dwelling Supplement', rate: LBTT_ADS_RATE, amount: 24_000 };
        expect(estimate.supplement).toEqual({ ...ads, formatted });
        expect(estimate.bands).toEqual(calculateLbtt({ price: 300_000 }).bands);
        expect(estimate.notes).toHaveLength(1);
        expect(estimate.formatted).toMatchObject({ bandTax: '£4,600', total: '£28,600', effectiveRate: '9.53%' });
    });

    it('charges the supplement at £40,000 or more, and not below', () => {
        const under = calculateLbtt({ price: 39_999, buyer: 'additional-property' });
        expect(under).toMatchObject({ supplement: null, total: 0 });
        expect(under.notes).toEqual(['The Additional Dwelling Supplement is not charged on purchases under £40,000.']);
        const at = calculateLbtt({ price: 40_000, buyer: 'additional-property' });
        expect(at).toMatchObject({ bandTax: 0, total: 3_200, supplement: { amount: 3_200 } });
        expect(lbtt(40_012, { buyer: 'additional-property' })).toBe(3_200);
    });

    it('matches the worked examples on revenue.scot "Non-residential property", and the band edges', () => {
        const nonResidential = (price: number) => lbtt(price, nonResidentialProperty);
        expectTotals(nonResidential, { 145_000: 0, 465_000: 11_750 });
        expectTotals(nonResidential, { 150_000: 0, 150_100: 1, 250_000: 1_000, 250_020: 1_001 });
    });

    it('has no relief or supplement at non-residential rates, and says so', () => {
        const supplement = calculateLbtt({ price: 465_000, ...additionalProperty, ...nonResidentialProperty });
        expect(supplement).toMatchObject({ total: 11_750, supplement: null });
        expect(supplement.notes[0]).toBe('The Additional Dwelling Supplement is not charged at non-residential rates.');
        const relief = calculateLbtt({ price: 160_000, buyer: 'first-time-buyer', propertyType: 'non-residential' });
        expect(relief.notes).toEqual(['First-time buyer relief does not apply at non-residential rates.']);
    });

    it('taxes six or more dwellings at non-residential rates (revenue.scot LBTT4012)', () => {
        expect(calculateLbtt({ price: 465_000, dwellings: 5 })).toMatchObject({ propertyType: 'residential' });
        const six = calculateLbtt({ price: 465_000, dwellings: 6, buyer: 'additional-property' });
        expect(six).toMatchObject({ propertyType: 'non-residential', total: 11_750, supplement: null });
        expect(six.notes).toHaveLength(2);
    });
});

describe('calculateLtt (Wales)', () => {
    it('matches the worked examples in gov.wales technical guidance LTTA/3020 (main rates)', () => {
        expectTotals(ltt, { 120_000: 0, 350_000: 7_500, 1_700_000: 135_750, 36_500: 0 });
    });

    it('matches the worked examples in gov.wales technical guidance LTTA/3020 (higher rates)', () => {
        expectTotals((price) => ltt(price, { buyer: 'additional-property' }), { 130_000: 6_500, 330_000: 22_950 });
    });

    it('charges each main residential band from its edge', () => {
        expectTotals(ltt, { 225_000: 0, 225_100: 6, 400_000: 10_500, 400_040: 10_503 });
        expectTotals(ltt, { 750_000: 36_750, 750_010: 36_751, 1_500_000: 111_750, 1_500_100: 111_762 });
        expect(calculateLtt({ price: 400_000 }).bands[2]?.formatted.rate).toBe('7.5%');
    });

    it('charges each higher residential band from its edge', () => {
        const estimate = calculateLtt({ price: 2_000_000, buyer: 'additional-property' });
        expect(estimate).toMatchObject({ country: 'wales', tax: 'LTT', total: 271_200, supplement: null, notes: [] });
        expect(estimate.bands.map((band) => band.tax)).toEqual([9_000, 5_950, 15_000, 43_750, 112_500, 85_000]);
        const higher = (price: number) => ltt(price, additionalProperty);
        expectTotals(higher, { 180_000: 9_000, 250_000: 14_950, 400_000: 29_950, 750_000: 73_700, 1_500_000: 186_200 });
    });

    it('uses higher rates at £40,000 or more, and main rates below', () => {
        const under = calculateLtt({ price: 39_999, buyer: 'additional-property' });
        expect(under.total).toBe(0);
        expect(under.notes).toHaveLength(1);
        expect(under.notes[0]).toContain('under £40,000');
        expect(ltt(40_000, { buyer: 'additional-property' })).toBe(2_000);
    });

    it('has no first-time buyer relief, and records that in the notes', () => {
        const estimate = calculateLtt({ price: 350_000, buyer: 'first-time-buyer' });
        expect(estimate).toMatchObject({ buyer: 'first-time-buyer', total: 7_500 });
        expect(estimate.notes).toEqual(['Wales has no first-time buyer relief, so the main residential rates apply.']);
    });

    it('matches the gov.wales LTTA/3020 non-residential example (£300,000) and the band edges', () => {
        const nonResidential = (price: number) => ltt(price, nonResidentialProperty);
        expectTotals(nonResidential, {
            300_000: 2_750,
            225_000: 0,
            250_000: 250,
            1_000_000: 37_750,
            2_000_000: 97_750,
        });
        const additional = calculateLtt({ price: 300_000, ...additionalProperty, ...nonResidentialProperty });
        expect(additional.total).toBe(2_750);
        expect(additional.notes).toEqual(['The higher residential rates are not charged on non-residential property.']);
    });

    it('notes the choice of rates for six or more dwellings without changing the tax', () => {
        const estimate = calculateLtt({ price: 350_000, dwellings: 6 });
        expect(estimate).toMatchObject({ propertyType: 'residential', total: 7_500 });
        expect(estimate.notes).toHaveLength(1);
    });
});

describe('calculatePropertyTax', () => {
    it('lists the countries with their tax', () => {
        const taxes = COUNTRIES.map(({ value, tax }) => `${value}: ${tax}`);
        expect(taxes).toEqual(['england: SDLT', 'northern-ireland: SDLT', 'scotland: LBTT', 'wales: LTT']);
        expect([isCountry('wales'), isCountry('ireland')]).toEqual([true, false]);
    });

    it('dispatches Scotland to LBTT and Wales to LTT', () => {
        const input = { price: 330_000, buyer: 'additional-property' } as const;
        expect(calculatePropertyTax({ country: 'scotland', ...input })).toEqual(calculateLbtt(input));
        expect(calculatePropertyTax({ country: 'wales', ...input })).toEqual(calculateLtt(input));
    });

    it('gives the same SDLT as calculateStampDuty for England and Northern Ireland', () => {
        const inputs: PropertyTaxInput[] = [
            { price: 750_000 },
            { price: 500_000, buyer: 'first-time-buyer' },
            { price: 3_250_000, buyer: 'additional-property', nonUkResident: true },
            { price: 465_000, propertyType: 'non-residential' },
            { price: 900_000, dwellings: 6 },
        ];
        for (const input of inputs) {
            const sdlt = calculateStampDuty(input);
            for (const country of ['england', 'northern-ireland'] as const) {
                const estimate = calculatePropertyTax({ country, ...input });
                expect(estimate).toMatchObject({ country, tax: 'SDLT', supplement: null, notes: [] });
                expect(estimate).toMatchObject({ bandTax: sdlt.stampDuty, total: sdlt.stampDuty, bands: sdlt.bands });
                for (const key of ['price', 'buyer', 'nonUkResident', 'propertyType', 'effectiveRate'] as const)
                    expect(estimate[key]).toBe(sdlt[key]);
                expect(estimate.formatted.total).toBe(sdlt.formatted.stampDuty);
            }
        }
        expect(calculatePropertyTax({ price: 750_000 })).toMatchObject({ country: 'england', total: 27_500 });
    });

    it('notes that Scotland and Wales have no non-UK resident surcharge', () => {
        for (const country of ['scotland', 'wales'] as const) {
            const resident = calculatePropertyTax({ country, price: 500_000 });
            const nonResident = calculatePropertyTax({ country, price: 500_000, nonUkResident: true });
            expect(nonResident).toMatchObject({ nonUkResident: true, total: resident.total });
            expect(nonResident.notes).toHaveLength(1);
            expect(nonResident.notes[0]).toContain('no surcharge for non-UK residents');
        }
    });

    it('survives JSON: the top band ends in null', () => {
        for (const country of COUNTRIES.map(({ value }) => value)) {
            const estimate = calculatePropertyTax({ country, price: 2_000_000, buyer: 'additional-property' });
            expect(JSON.parse(JSON.stringify(estimate))).toEqual(estimate);
            expect(estimate.bands.at(-1)?.to).toBeNull();
        }
    });

    it('handles a price of 0 and rejects invalid input with a RangeError', () => {
        for (const country of COUNTRIES.map(({ value }) => value)) {
            expect(calculatePropertyTax({ country, price: 0 })).toMatchObject({ total: 0, effectiveRate: 0 });
            expect(() => calculatePropertyTax({ country, price: -1 })).toThrow(RangeError);
            expect(() => calculatePropertyTax({ country, price: Number.NaN })).toThrow(RangeError);
            expect(() => calculatePropertyTax({ country, price: Infinity })).toThrow(RangeError);
            expect(() => calculatePropertyTax({ country, price: '1' as never })).toThrow(RangeError);
            expect(() => calculatePropertyTax({ country, price: 1, buyer: 'landlord' as never })).toThrow(RangeError);
            expect(() => calculatePropertyTax({ country, price: 1, propertyType: 'x' as never })).toThrow(RangeError);
            expect(() => calculatePropertyTax({ country, price: 1, dwellings: 0 })).toThrow(RangeError);
            expect(() => calculatePropertyTax({ country, price: 1, dwellings: 1.5 })).toThrow(RangeError);
        }
        expect(() => calculatePropertyTax({ country: 'ireland' as never, price: 1 })).toThrow(RangeError);
    });
});

describe('rate tables', () => {
    it('exports contiguous tables ending in an open band, with their effective dates', () => {
        for (const bands of [...Object.values(LBTT_BAND_TABLES), ...Object.values(LTT_BAND_TABLES)]) {
            expect(bands[0]?.range[0]).toBe(0);
            expect(bands.at(-1)?.range[1]).toBe(Infinity);
            bands.slice(1).forEach((band, index) => expect(band.range[0]).toBe(bands[index]?.range[1]));
        }
        expect(Object.values(LBTT_EFFECTIVE_FROM).join()).toBe('2021-04-01,2019-01-25,2024-12-05');
        expect(Object.values(LTT_EFFECTIVE_FROM).join()).toBe('2022-10-10,2024-12-11,2020-12-22');
        expect([LBTT_RATES_EFFECTIVE_FROM, LTT_RATES_EFFECTIVE_FROM]).toEqual(['2024-12-05', '2024-12-11']);
    });
});
