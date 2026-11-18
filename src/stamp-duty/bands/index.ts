import * as homeMover from './default';
import * as firstTimeBuyer from './first-time-buyer';
import * as firstTimeBuyerNonUkResident from './first-time-buyer-non-uk-resident';
import * as nonUkResident from './non-uk-resident';
import * as secondHome from './second-home';
import * as secondHomeNonUkResident from './second-home-non-uk-resident';

export type { Band } from './types';
export * from './non-residential';

/**
 * Every rate table, for pages that show the rates themselves. Each has `initialThreshold`
 * (purchases under £40,000, where no SDLT is due) and `baseBands`; the first-time buyer tables
 * also have `highPriceBands`, used above £500,000 where the relief is lost.
 */
export const BAND_TABLES = {
    homeMover,
    firstTimeBuyer,
    firstTimeBuyerNonUkResident,
    nonUkResident,
    secondHome,
    secondHomeNonUkResident,
} as const;

/** Where SDLT applies. Scotland (LBTT) and Wales (LTT) are in `land-tax`. */
export const SDLT_JURISDICTION = 'England and Northern Ireland';

/** The date the thresholds in these tables came into force. Update alongside the tables. */
export const SDLT_RATES_EFFECTIVE_FROM = '2025-04-01';
