import { describe, expect, it } from 'vitest';

import {
    BUYER_TYPES,
    calculateStampDuty,
    decodeStampDutyHash,
    encodeStampDutyHash,
    formatNumber,
    formatPercentage,
    formatPrice,
    formatRange,
    formatRate,
    fromBandOptions,
    getStampDutyPdfModel,
    getStampDutyResponse,
    getStampDutyTable,
    parsePrice,
    parsePriceParam,
    stampDutyByPrice,
    stampDutyFor,
    STAMP_DUTY_COLUMNS,
    toBandOptions,
} from '../src/index';

describe('calculateStampDuty', () => {
    it('returns numbers and display strings for a home mover', () => {
        const estimate = calculateStampDuty({ price: 750_000 });
        expect(estimate).toMatchObject({
            price: 750_000,
            buyer: 'home-mover',
            nonUkResident: false,
            stampDuty: 27_500,
            formatted: { price: '£750,000', stampDuty: '£27,500', effectiveRate: '3.67%' },
        });
        expect(estimate.bands.map((band) => band.formatted)).toEqual([
            { range: '£0 – £125,000', rate: '0%', taxable: '£125,000', tax: '£0' },
            { range: '£125,001 – £250,000', rate: '2%', taxable: '£125,000', tax: '£2,500' },
            { range: '£250,001 – £925,000', rate: '5%', taxable: '£500,000', tax: '£25,000' },
            { range: '£925,001 – £1,500,000', rate: '10%', taxable: '£0', tax: '£0' },
            { range: '£1,500,001+', rate: '12%', taxable: '£0', tax: '£0' },
        ]);
    });

    it('matches the reference figures for every buyer type', () => {
        const at = (price: number, buyer: (typeof BUYER_TYPES)[number]['value'], nonUkResident = false) =>
            calculateStampDuty({ price, buyer, nonUkResident }).stampDuty;
        expect(at(5_250_000, 'home-mover')).toBe(543_750);
        expect(at(5_250_000, 'home-mover', true)).toBe(648_750);
        expect(at(500_000, 'first-time-buyer')).toBe(10_000);
        expect(at(1_600_000, 'first-time-buyer')).toBe(105_750);
        expect(at(1_600_000, 'first-time-buyer', true)).toBe(137_750);
        expect(at(750_000, 'additional-property')).toBe(65_000);
        expect(at(3_250_000, 'additional-property', true)).toBe(531_250);
    });

    it('survives JSON: the top band ends in null', () => {
        const estimate = calculateStampDuty({ price: 2_000_000 });
        expect(JSON.parse(JSON.stringify(estimate))).toEqual(estimate);
        expect(estimate.bands.at(-1)).toMatchObject({ from: 1_500_000, to: null });
    });

    it('handles a price of 0 and rejects nonsense', () => {
        expect(calculateStampDuty({ price: 0 })).toMatchObject({ stampDuty: 0, effectiveRate: 0 });
        expect(() => calculateStampDuty({ price: -1 })).toThrow(RangeError);
        expect(() => calculateStampDuty({ price: Number.NaN })).toThrow(RangeError);
        expect(() => calculateStampDuty({ price: 1, buyer: 'landlord' as never })).toThrow(RangeError);
    });

    it('lays an estimate out as a table', () => {
        const table = getStampDutyTable(calculateStampDuty({ price: 300_000 }));
        expect(table.columns).toBe(STAMP_DUTY_COLUMNS);
        expect(table.rows).toHaveLength(5);
        expect(table.rows[1]).toEqual({
            key: 'band_125000',
            range: '£125,001 – £250,000',
            rate: '2%',
            taxable: '£125,000',
            tax: '£2,500',
        });
        expect(table.summary.map((item) => item.formatted)).toEqual(['£300,000', '£5,000', '1.67%']);
        expect(table.totals.tax).toBe('£5,000');
    });

    it('converts between buyer types and low-level flags', () => {
        for (const { value: buyer } of BUYER_TYPES)
            for (const nonUkResident of [true, false])
                expect(fromBandOptions(toBandOptions({ buyer, nonUkResident }))).toEqual({ buyer, nonUkResident });
        expect(fromBandOptions({ secondHome: true, firstTimeBuyer: true, ukResident: true }).buyer).toBe(
            'additional-property',
        );
    });

    it('prices listing cards', () => {
        expect(stampDutyFor(1_000_000)).toBe(43_750);
        expect(stampDutyFor(null)).toBeNull();
        expect(stampDutyFor(0)).toBeNull();
        expect(stampDutyByPrice([1_000_000, null, 2_000_000, 1_000_000, Number.NaN])).toEqual({
            1_000_000: 43_750,
            2_000_000: 153_750,
        });
    });
});

describe('HTTP helpers', () => {
    it('reproduces GET /api/stamp-duty/{price}', () => {
        const body = JSON.parse(
            JSON.stringify(
                getStampDutyResponse({ price: '1600000', ukResident: 'true', firstTimeBuyer: 'false', secondHome: 'false' }),
            ),
        );
        expect(body.stampDuty).toEqual({ value: 105_750, formatted: '£105,750' });
        expect(body.actualRate.formatted).toBe('6.61%');
        expect(body.bands[4]).toEqual({
            range: [1_500_000, null],
            rate: 12,
            taxableSum: 100_000,
            tax: 12_000,
            formatted: { range: '£1,500,001+', rate: '12%', taxableSum: '£100,000', tax: '£12,000' },
        });
    });

    it('treats a missing ukResident flag as non-resident, as the endpoint always has', () => {
        expect(getStampDutyResponse({ price: '750000' }).stampDuty.value).toBe(42_500);
        expect(getStampDutyResponse({ price: '750000', ukResident: 'true' }).stampDuty.value).toBe(27_500);
        expect(getStampDutyResponse({ price: '750000', ukResident: 'TRUE' }).stampDuty.value).toBe(42_500);
    });

    it('answers a zero price with a null actual rate once serialised', () => {
        const body = JSON.parse(JSON.stringify(getStampDutyResponse({ price: '0', ukResident: 'true' })));
        expect(body.actualRate).toEqual({ value: null, formatted: '0.00%' });
    });

    it('builds the PDF model from a hash', () => {
        const hash = encodeStampDutyHash({ price: 750_000, ukResident: 'true', secondHome: 'true' });
        expect(hash).toBe(btoa(JSON.stringify({ price: 750_000, ukResident: 'true', secondHome: 'true' })));
        expect(decodeStampDutyHash(hash)).toEqual({ price: 750_000, ukResident: 'true', secondHome: 'true' });
        const model = getStampDutyPdfModel({ hash, address: 'Flat 2, Cadogan Place' });
        expect(model).toMatchObject({ address: 'Flat 2, Cadogan Place', price: 750_000, stampDuty: 65_000 });
        expect(model.bands).toHaveLength(5);
        expect(getStampDutyPdfModel({ hash }).address).toBeNull();
    });
});

describe('formatting', () => {
    it('formats like the numeral formats it replaced', () => {
        expect(formatPrice(43_750, '0,00')).toBe('£43,750');
        expect(formatPrice(43_750)).toBe('£43,750.00');
        expect(formatPrice(1_234_567.891, '0,0')).toBe('£1,234,567');
        expect(formatPrice(1_234_567, '0,0', 1000)).toBe('£1,234,000');
        expect(formatPercentage(3.6666667)).toBe('3.67%');
        expect(formatPercentage(12, '0,00')).toBe('12%');
        expect(formatPercentage(Number.NaN)).toBe('0.00%');
        expect(formatNumber(999.5)).toBe('1,000');
        expect(formatNumber(-5, 2)).toBe('-5.00');
        expect(formatRange([1_500_000, null])).toBe('£1,500,001+');
    });

    it('formats rates and parses prices', () => {
        expect(formatRate(5)).toBe('5%');
        expect(formatRate(10)).toBe('10%');
        expect(formatRate(12.5)).toBe('12.5%');
        expect(formatRate(100)).toBe('100%');
        expect(formatRate(0)).toBe('0%');
        expect(parsePrice('£1,250,000.50')).toBe(1_250_000.5);
        expect(parsePriceParam('1,250,000')).toBe(1_250_000);
        expect(parsePriceParam('0')).toBeNull();
        expect(parsePriceParam('12abc')).toBeNull();
        expect(parsePriceParam(undefined)).toBeNull();
    });
});
