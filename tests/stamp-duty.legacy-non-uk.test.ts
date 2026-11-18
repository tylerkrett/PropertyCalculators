import { expect, test } from 'vitest';

import * as Default from '../src/stamp-duty/bands/default';
import * as FirstTimeBuyer from '../src/stamp-duty/bands/first-time-buyer';
import * as FirstTimeBuyerAndNonUKResident from '../src/stamp-duty/bands/first-time-buyer-non-uk-resident';
import * as NonUKResident from '../src/stamp-duty/bands/non-uk-resident';
import * as SecondHome from '../src/stamp-duty/bands/second-home';
import * as SecondHomeAndNonUKResident from '../src/stamp-duty/bands/second-home-non-uk-resident';
import { formatPercentage, formatRange, getBands, getStampDuty, getStaticStampDuty } from '../src/stamp-duty/index';

test('It should be able to determine the bands and calculations for non-UK resident applicants', () => {
    const options = {
        secondHome: false,
        firstTimeBuyer: false,
        ukResident: false,
    };

    const a = getBands(39_999, options);
    expect(a).toEqual(NonUKResident.initialThreshold);
    expect(getStampDuty(39_999, a).value).toBe(0);
    expect(getStampDuty(39_999, a).bands).toMatchSnapshot();

    const b = getBands(40_000, options);
    expect(b).toEqual(NonUKResident.baseBands);
    expect(getStampDuty(40_000, b).value).toBe(800);
    expect(getStampDuty(40_000, b).bands).toMatchSnapshot();

    const c = getBands(299_999, options);
    expect(c).toEqual(NonUKResident.baseBands);
    expect(getStampDuty(299_999, c).value).toBe(10_999);
    expect(getStampDuty(299_999, c).bands).toMatchSnapshot();

    const d = getBands(300_000, options);
    expect(d).toEqual(NonUKResident.baseBands);
    expect(getStampDuty(300_000, d).value).toBe(11_000);
    expect(getStampDuty(300_000, d).bands).toMatchSnapshot();

    const e = getBands(750_000, options);
    expect(e).toEqual(NonUKResident.baseBands);
    expect(getStampDuty(750_000, e).value).toBe(42_500);
    expect(getStampDuty(750_000, e).bands).toMatchSnapshot();

    const f = getBands(5_250_000, options);
    expect(f).toEqual(NonUKResident.baseBands);
    expect(getStampDuty(5_250_000, f).value).toBe(648_750);
    expect(getStampDuty(5_250_000, f).bands).toMatchSnapshot();
});

test('It should be able to determine the bands and calculations for second home and non-UK resident applicants', () => {
    const options = {
        secondHome: true,
        firstTimeBuyer: false,
        ukResident: false,
    };

    const a = getBands(39_999, options);
    expect(a).toEqual(SecondHomeAndNonUKResident.initialThreshold);
    expect(getStampDuty(39_999, a).value).toBe(0);
    expect(getStampDuty(39_999, a).bands).toMatchSnapshot();

    const b = getBands(40_000, options);
    expect(b).toEqual(SecondHomeAndNonUKResident.baseBands);
    expect(getStampDuty(40_000, b).value).toBe(2_800);
    expect(getStampDuty(40_000, b).bands).toMatchSnapshot();

    const c = getBands(299_999, options);
    expect(c).toEqual(SecondHomeAndNonUKResident.baseBands);
    expect(getStampDuty(299_999, c).value).toBe(25_999);
    expect(getStampDuty(299_999, c).bands).toMatchSnapshot();

    const d = getBands(300_000, options);
    expect(d).toEqual(SecondHomeAndNonUKResident.baseBands);
    expect(getStampDuty(300_000, d).value).toBe(26_000);
    expect(getStampDuty(300_000, d).bands).toMatchSnapshot();

    const e = getBands(750_000, options);
    expect(e).toEqual(SecondHomeAndNonUKResident.baseBands);
    expect(getStampDuty(750_000, e).value).toBe(80_000);
    expect(getStampDuty(750_000, e).bands).toMatchSnapshot();

    const f = getBands(5_250_000, options);
    expect(f).toEqual(SecondHomeAndNonUKResident.baseBands);
    expect(getStampDuty(5_250_000, f).value).toBe(911_250);
    expect(getStampDuty(5_250_000, f).bands).toMatchSnapshot();

    const g = getBands(3_250_000, options);
    expect(g).toEqual(SecondHomeAndNonUKResident.baseBands);
    expect(getStampDuty(3_250_000, g).value).toBe(531_250);
    expect(getStampDuty(3_250_000, g).bands).toMatchSnapshot();
});

test('It should be able to determine the bands and calculations for first timer buyer and non-UK resident applicants', () => {
    const options = {
        secondHome: false,
        firstTimeBuyer: true,
        ukResident: false,
    };

    const a = getBands(39_999, options);
    expect(a).toEqual(FirstTimeBuyerAndNonUKResident.initialThreshold);
    expect(getStampDuty(39_999, a).value).toBe(0);
    expect(getStampDuty(39_999, a).bands).toMatchSnapshot();

    const b = getBands(40_000, options);
    expect(b).toEqual(FirstTimeBuyerAndNonUKResident.baseBands);
    expect(getStampDuty(40_000, b).value).toBe(800);
    expect(getStampDuty(40_000, b).bands).toMatchSnapshot();

    const c = getBands(249_999, options);
    expect(c).toEqual(FirstTimeBuyerAndNonUKResident.baseBands);
    expect(getStampDuty(249_999, c).value).toBe(4_999);
    expect(getStampDuty(249_999, c).bands).toMatchSnapshot();

    const d = getBands(500_000, options);
    expect(d).toEqual(FirstTimeBuyerAndNonUKResident.baseBands);
    expect(getStampDuty(500_000, d).value).toBe(20_000);
    expect(getStampDuty(500_000, d).bands).toMatchSnapshot();

    const e = getBands(1_600_000, options);
    expect(e).toEqual(FirstTimeBuyerAndNonUKResident.highPriceBands);
    expect(getStampDuty(1_600_000, e).value).toBe(137_750);
    expect(getStampDuty(1_600_000, e).bands).toMatchSnapshot();

    const f = getBands(5_250_000, options);
    expect(f).toEqual(FirstTimeBuyerAndNonUKResident.highPriceBands);
    expect(getStampDuty(5_250_000, f).value).toBe(648_750);
    expect(getStampDuty(5_250_000, f).bands).toMatchSnapshot();
});

test('It should be able to compute the static stamp duty', () => {
    expect(getStaticStampDuty(0)).toBe(null);
    expect(getStaticStampDuty(1_000_000, 1)).toBe(null);
    expect(getStaticStampDuty(1_000_000, 2)).not.toBe(null);

    expect(getStaticStampDuty(1_000_000)).toBe('Stamp Duty £43,750');
    expect(getStaticStampDuty(2_000_000)).toBe('Stamp Duty £153,750');
});
