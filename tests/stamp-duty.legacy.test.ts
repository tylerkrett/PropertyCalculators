import { expect, test } from 'vitest';

import * as Default from '../src/stamp-duty/bands/default';
import * as FirstTimeBuyer from '../src/stamp-duty/bands/first-time-buyer';
import * as FirstTimeBuyerAndNonUKResident from '../src/stamp-duty/bands/first-time-buyer-non-uk-resident';
import * as NonUKResident from '../src/stamp-duty/bands/non-uk-resident';
import * as SecondHome from '../src/stamp-duty/bands/second-home';
import * as SecondHomeAndNonUKResident from '../src/stamp-duty/bands/second-home-non-uk-resident';
import { formatPercentage, formatRange, getBands, getStampDuty, getStaticStampDuty } from '../src/stamp-duty/index';

test('It should be able to format the ranges into a readable format', () => {
    expect(formatRange([0, 500_000])).toBe('£0 – £500,000');
    expect(formatRange([400_000, 550_000])).toBe('£400,001 – £550,000');
    expect(formatRange([500_000, Infinity])).toBe('£500,001+');
});

test('It should be able to format the percetanges', () => {
    expect(formatPercentage(0)).toBe('0.00%');
    expect(formatPercentage(5)).toBe('5.00%');
    expect(formatPercentage(7.25)).toBe('7.25%');
});

test('It should be able to determine the bands and calculations for default applicants', () => {
    const options = {
        secondHome: false,
        firstTimeBuyer: false,
        ukResident: true,
    };

    const a = getBands(39_999, options);
    expect(a).toEqual(Default.initialThreshold);
    expect(getStampDuty(39_999, a).value).toBe(0);
    expect(getStampDuty(39_999, a).bands).toMatchSnapshot();

    const b = getBands(40_000, options);
    expect(b).toEqual(Default.baseBands);
    expect(getStampDuty(40_000, b).value).toBe(0);
    expect(getStampDuty(40_000, b).bands).toMatchSnapshot();

    const c = getBands(299_999, options);
    expect(c).toEqual(Default.baseBands);
    expect(getStampDuty(299_999, c).value).toBe(4_999);
    expect(getStampDuty(299_999, c).bands).toMatchSnapshot();

    const d = getBands(300_000, options);
    expect(d).toEqual(Default.baseBands);
    expect(getStampDuty(300_000, d).value).toBe(5_000);
    expect(getStampDuty(300_000, d).bands).toMatchSnapshot();

    const e = getBands(750_000, options);
    expect(e).toEqual(Default.baseBands);
    expect(getStampDuty(750_000, e).value).toBe(27_500);
    expect(getStampDuty(750_000, e).bands).toMatchSnapshot();

    const f = getBands(5_250_000, options);
    expect(f).toEqual(Default.baseBands);
    expect(getStampDuty(5_250_000, f).value).toBe(543_750);
    expect(getStampDuty(5_250_000, f).bands).toMatchSnapshot();
});

test('It should be able to determine the bands and calculations for second home applicants', () => {
    const options = {
        secondHome: true,
        firstTimeBuyer: false,
        ukResident: true,
    };

    const a = getBands(39_999, options);
    expect(a).toEqual(SecondHome.initialThreshold);
    expect(getStampDuty(39_999, a).value).toBe(0);
    expect(getStampDuty(39_999, a).bands).toMatchSnapshot();

    const b = getBands(40_000, options);
    expect(b).toEqual(SecondHome.baseBands);
    expect(getStampDuty(40_000, b).value).toBe(2_000);
    expect(getStampDuty(40_000, b).bands).toMatchSnapshot();

    const c = getBands(299_999, options);
    expect(c).toEqual(SecondHome.baseBands);
    expect(getStampDuty(299_999, c).value).toBe(19_999);
    expect(getStampDuty(299_999, c).bands).toMatchSnapshot();

    const d = getBands(300_000, options);
    expect(d).toEqual(SecondHome.baseBands);
    expect(getStampDuty(300_000, d).value).toBe(20_000);
    expect(getStampDuty(300_000, d).bands).toMatchSnapshot();

    const e = getBands(750_000, options);
    expect(e).toEqual(SecondHome.baseBands);
    expect(getStampDuty(750_000, e).value).toBe(65_000);
    expect(getStampDuty(750_000, e).bands).toMatchSnapshot();

    const f = getBands(5_250_000, options);
    expect(f).toEqual(SecondHome.baseBands);
    expect(getStampDuty(5_250_000, f).value).toBe(806_250);
    expect(getStampDuty(5_250_000, f).bands).toMatchSnapshot();
});

test('It should be able to determine the bands and calculations for first time buyer applicants', () => {
    const options = {
        secondHome: false,
        firstTimeBuyer: true,
        ukResident: true,
    };

    const a = getBands(39_999, options);
    expect(a).toEqual(FirstTimeBuyer.initialThreshold);
    expect(getStampDuty(39_999, a).value).toBe(0);
    expect(getStampDuty(39_999, a).bands).toMatchSnapshot();

    const b = getBands(40_000, options);
    expect(b).toEqual(FirstTimeBuyer.baseBands);
    expect(getStampDuty(40_000, b).value).toBe(0);
    expect(getStampDuty(40_000, b).bands).toMatchSnapshot();

    const c = getBands(249_999, options);
    expect(c).toEqual(FirstTimeBuyer.baseBands);
    expect(getStampDuty(249_999, c).value).toBe(0);
    expect(getStampDuty(249_999, c).bands).toMatchSnapshot();

    const d = getBands(500_000, options);
    expect(d).toEqual(FirstTimeBuyer.baseBands);
    expect(getStampDuty(500_000, d).value).toBe(10_000);
    expect(getStampDuty(500_000, d).bands).toMatchSnapshot();

    const e = getBands(1_600_000, options);
    expect(e).toEqual(FirstTimeBuyer.highPriceBands);
    expect(getStampDuty(1_600_000, e).value).toBe(105_750);
    expect(getStampDuty(1_600_000, e).bands).toMatchSnapshot();

    const f = getBands(5_250_000, options);
    expect(f).toEqual(FirstTimeBuyer.highPriceBands);
    expect(getStampDuty(5_250_000, f).value).toBe(543_750);
    expect(getStampDuty(5_250_000, f).bands).toMatchSnapshot();
});
