import { base64Decode, base64Encode, utf8Decode, utf8Encode } from '../bytes';
import { type CalculatedBand, computeActualRate, getBands, getStampDuty } from './calculate';
import { formatPercentage, formatPrice, formatRange } from './format';

/*
 * The data behind two HTTP endpoints, so each route is a couple of lines:
 *
 *   /api/stamp-duty/[price]      response.json(getStampDutyResponse(request.query))
 *   /api/stamp-duty/pdf/[hash]   <Layout model={getStampDutyPdfModel(request.query)} />
 */

type QueryValue = string | string[] | undefined;

/** `price` plus the three flags, as they arrive in a query string. A flag is on only when it is exactly `"true"`. */
export type StampDutyQuery = {
    price?: QueryValue | number;
    ukResident?: QueryValue | boolean;
    firstTimeBuyer?: QueryValue | boolean;
    secondHome?: QueryValue | boolean;
};

export type ParsedStampDutyQuery = {
    price: number;
    ukResident: boolean;
    firstTimeBuyer: boolean;
    secondHome: boolean;
};

const flag = (value: unknown) => value === true || value === 'true';

/** Note the default: `ukResident` is `false` unless sent, so callers should always send all three flags. */
export function parseStampDutyQuery(query: StampDutyQuery): ParsedStampDutyQuery {
    return {
        price: Number(query.price),
        ukResident: flag(query.ukResident),
        firstTimeBuyer: flag(query.firstTimeBuyer),
        secondHome: flag(query.secondHome),
    };
}

export type StampDutyResponse = {
    bands: (CalculatedBand & { formatted: { range: string; rate: string; taxableSum: string; tax: string } })[];
    stampDuty: { value: number; formatted: string };
    /** `value` is `NaN` (JSON `null`) when the price is 0. */
    actualRate: { value: number; formatted: string };
};

/**
 * The body for `GET /api/stamp-duty/{price}`. The open-ended top band's upper bound
 * is `Infinity` here and becomes `null` once serialised.
 */
export function getStampDutyResponse(query: StampDutyQuery): StampDutyResponse {
    const { price, ...options } = parseStampDutyQuery(query);
    const bands = getBands(price, options);
    const total = getStampDuty(price, bands);
    const actualRate = computeActualRate(price, bands);

    return {
        bands: total.bands.map((band) => ({
            ...band,
            formatted: {
                range: formatRange(band.range),
                rate: formatPercentage(band.rate, '0,00'),
                taxableSum: formatPrice(band.taxableSum, '0,0'),
                tax: formatPrice(band.tax, '0,0'),
            },
        })),
        stampDuty: { value: total.value, formatted: formatPrice(total.value, '0,0') },
        actualRate: { value: actualRate, formatted: formatPercentage(actualRate) },
    };
}

/** What a stamp duty PDF shows. Render it with whatever PDF library the app uses. */
export type StampDutyPdfModel = {
    address: string | null;
    price: number;
    stampDuty: number;
    actualRate: number;
    bands: CalculatedBand[];
};

/** Packs a form's values into the `[hash]` segment of the PDF URL (base64 JSON). */
export function encodeStampDutyHash(model: Partial<Record<keyof ParsedStampDutyQuery, unknown>>): string {
    return base64Encode(utf8Encode(JSON.stringify(model)));
}

/** Reads a `[hash]` segment back. Throws a `TypeError` on anything that isn't a base64 JSON object. */
export function decodeStampDutyHash(hash: string): StampDutyQuery {
    let value: unknown;
    try {
        value = JSON.parse(utf8Decode(base64Decode(hash.replace(/-/g, '+').replace(/_/g, '/'))));
    } catch {
        throw new TypeError('Invalid stamp duty hash: expected base64-encoded JSON');
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw new TypeError('Invalid stamp duty hash: expected a JSON object');
    return value as StampDutyQuery;
}

/**
 * The model for `GET /api/stamp-duty/pdf/{hash}?address=`. Flags inside the hash follow the same
 * rule as the JSON endpoint: on only when exactly `"true"` (or boolean `true`).
 */
export function getStampDutyPdfModel({ hash, address }: { hash: string; address?: QueryValue }): StampDutyPdfModel {
    const { price, ...options } = parseStampDutyQuery(decodeStampDutyHash(hash));
    const bands = getBands(price, options);
    const total = getStampDuty(price, bands);

    return {
        address: typeof address === 'string' && address ? address : null,
        price,
        stampDuty: total.value,
        actualRate: computeActualRate(price, bands),
        bands: total.bands,
    };
}
