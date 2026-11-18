/*
 * Stamp Duty Land Tax (England and Northern Ireland) in the result shape shared by all three
 * taxes. The figures come from the stamp duty calculator; this file adds the plain-English notes
 * that the Scottish and Welsh results carry, so every country explains itself the same way.
 */
import { calculateStampDuty, type StampDutyEstimate } from '../stamp-duty/estimate';
import { formatPounds } from '../stamp-duty/format';
import { FIRST_TIME_BUYER_MAX_PRICE, HIGHER_RATES_THRESHOLD, multipleDwellingsNote } from '../stamp-duty/purchase';
import {
    assembleEstimate,
    type Country,
    type PropertyTaxEstimate,
    type PropertyTaxInput,
    type ResolvedPropertyTaxInput,
    resolveInput,
} from './shared';

const THRESHOLD = formatPounds(HIGHER_RATES_THRESHOLD);
const HIGHER_RATES = 'The higher rates for additional dwellings';
const SURCHARGE = 'The non-UK resident surcharge';

/** The sentences explaining a relief or surcharge that was asked for but not applied, or applied unasked. */
function sdltNotes(input: ResolvedPropertyTaxInput, estimate: StampDutyEstimate): string[] {
    const notes: string[] = [];
    const additional = input.buyer === 'additional-property';

    if (estimate.propertyType === 'non-residential') {
        if (input.propertyType === 'residential')
            notes.push(
                'Six or more dwellings bought in one transaction are taxed at non-residential rates in England and Northern Ireland.',
            );
        if (input.buyer === 'first-time-buyer')
            notes.push('First-time buyer relief does not apply at non-residential rates.');
        if (additional) notes.push(`${HIGHER_RATES} are not charged at non-residential rates.`);
        if (input.nonUkResident) notes.push(`${SURCHARGE} is not charged at non-residential rates.`);
        return notes;
    }

    if (estimate.buyer !== input.buyer)
        notes.push(
            multipleDwellingsNote(
                input.dwellings,
                'the higher rates for additional dwellings are charged, and first-time buyer relief does not apply',
            ),
        );
    if (input.price < HIGHER_RATES_THRESHOLD) {
        if (additional) notes.push(`${HIGHER_RATES} are not charged on purchases under ${THRESHOLD}.`);
        if (input.nonUkResident) notes.push(`${SURCHARGE} is not charged on purchases under ${THRESHOLD}.`);
    } else if (estimate.buyer === 'first-time-buyer' && input.price > FIRST_TIME_BUYER_MAX_PRICE) {
        notes.push(
            `First-time buyer relief is not available above ${formatPounds(FIRST_TIME_BUYER_MAX_PRICE)}, so the standard rates apply.`,
        );
    }
    return notes;
}

/** SDLT for a purchase in England or Northern Ireland. Throws a `RangeError` on invalid input. */
export function calculateSdlt(
    country: Extract<Country, 'england' | 'northern-ireland'>,
    input: PropertyTaxInput,
): PropertyTaxEstimate {
    const resolved = resolveInput(input);
    const { price, buyer, nonUkResident, propertyType, dwellings } = resolved;
    const estimate = calculateStampDuty({ price, buyer, nonUkResident, propertyType, dwellings });
    const meta = {
        country,
        tax: 'SDLT',
        price,
        buyer: estimate.buyer,
        nonUkResident,
        propertyType: estimate.propertyType,
    } as const;
    return assembleEstimate(
        meta,
        { tax: estimate.stampDuty, bands: estimate.bands },
        null,
        sdltNotes(resolved, estimate),
    );
}
