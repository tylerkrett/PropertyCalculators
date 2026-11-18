import { describe, expect, it } from 'vitest';

import { getHigherRatesRefund, getRefundDeadlines, resolveBuyer } from '../src';

describe('replacing a main residence', () => {
    it('resolves the buyer type from yes/no answers', () => {
        expect(resolveBuyer({})).toMatchObject({ buyer: 'home-mover', reason: 'only-property' });
        expect(resolveBuyer({ firstTimeBuyer: true })).toMatchObject({
            buyer: 'first-time-buyer',
            higherRatesApply: false,
        });
        expect(resolveBuyer({ ownsOtherProperty: true })).toMatchObject({
            buyer: 'additional-property',
            reason: 'additional-property',
            refundPossible: false,
        });
        expect(
            resolveBuyer({ ownsOtherProperty: true, replacingMainResidence: true, previousHomeSold: true }),
        ).toMatchObject({ buyer: 'home-mover', higherRatesApply: false, reason: 'replacing-main-residence' });
        expect(resolveBuyer({ ownsOtherProperty: true, replacingMainResidence: true })).toMatchObject({
            buyer: 'additional-property',
            higherRatesApply: true,
            refundPossible: true,
            reason: 'previous-home-not-sold',
        });
        // Owning another property beats a first-time buyer answer.
        expect(resolveBuyer({ firstTimeBuyer: true, ownsOtherProperty: true }).buyer).toBe('additional-property');
    });

    it('works out the refund as 5% of the price', () => {
        const refund = getHigherRatesRefund({ price: 600_000 });
        expect(refund).toMatchObject({ paid: 50_000, standard: 20_000, refund: 30_000 });
        expect(refund.formatted.refund).toBe('£30,000');
        expect(getHigherRatesRefund({ price: 600_000, nonUkResident: true }).refund).toBe(30_000);
        expect(getHigherRatesRefund({ price: 30_000 }).refund).toBe(0);
    });

    it('gives the dates that matter', () => {
        expect(getRefundDeadlines({ purchaseDate: '2025-06-10' })).toEqual({
            sellBy: '2028-06-10',
            filingDate: '2025-06-24',
            claimBy: null,
            soldInTime: null,
        });
        // Twelve months beginning with the sale date (Schedule 4ZA paragraph 8(3)): the last day is the day before the anniversary.
        expect(getRefundDeadlines({ purchaseDate: '2025-06-10', saleDate: '2026-02-01' })).toMatchObject({
            claimBy: '2027-01-31',
            soldInTime: true,
        });
        // Sold before the return was due: the clock runs from the filing date.
        expect(getRefundDeadlines({ purchaseDate: '2025-06-10', saleDate: '2025-06-12' }).claimBy).toBe('2026-06-23');
        expect(getRefundDeadlines({ purchaseDate: '2024-02-29' }).sellBy).toBe('2027-02-28');
    });

    it('counts the three years from the day after the purchase (Schedule 4ZA paragraph 3(7A)(a))', () => {
        // The period runs 1 March 2025 to 29 February 2028, not to 28 February.
        expect(getRefundDeadlines({ purchaseDate: '2025-02-28' }).sellBy).toBe('2028-02-29');
        expect(getRefundDeadlines({ purchaseDate: '2028-02-28' }).sellBy).toBe('2031-02-28');
        expect(getRefundDeadlines({ purchaseDate: '2025-02-28', saleDate: '2028-02-29' }).soldInTime).toBe(true);
        expect(getRefundDeadlines({ purchaseDate: '2025-12-31', saleDate: '2026-06-30' }).claimBy).toBe('2027-06-29');
        // A period beginning on 29 February ends on 28 February of an ordinary year.
        expect(getRefundDeadlines({ purchaseDate: '2027-02-15', saleDate: '2028-02-29' }).claimBy).toBe('2029-02-28');
    });

    it('gives no claim date for a late sale, and refuses a sale that was not after the purchase', () => {
        const late = getRefundDeadlines({ purchaseDate: '2025-06-10', saleDate: '2028-06-11' });
        expect(late).toMatchObject({ soldInTime: false, claimBy: null, sellBy: '2028-06-10' });
        expect(getRefundDeadlines({ purchaseDate: '2025-06-10', saleDate: '2028-06-10' }).soldInTime).toBe(true);
        const before = () => getRefundDeadlines({ purchaseDate: '2025-06-01', saleDate: '2025-05-01' });
        expect(before).toThrow(RangeError);
        expect(before).toThrow(/no higher rates were due/);
        expect(() => getRefundDeadlines({ purchaseDate: '2025-06-01', saleDate: '2025-06-01' })).toThrow(RangeError);
    });

    it('rejects bad dates', () => {
        expect(() => getRefundDeadlines({ purchaseDate: '10/06/2025' })).toThrow(RangeError);
        expect(() => getRefundDeadlines({ purchaseDate: '2025-02-30' })).toThrow(RangeError);
        expect(() => getRefundDeadlines({ purchaseDate: '2025-06-10', saleDate: 'soon' })).toThrow(RangeError);
        // Years outside 2016 to 2200 used to come back as nonsense ('1903-01-01', '+010001-06').
        for (const purchaseDate of ['0000-01-01', '2015-12-31', '2201-01-01', '9998-06-01'])
            expect(() => getRefundDeadlines({ purchaseDate })).toThrow(/expected a year from 2016 to 2200/);
        expect(getRefundDeadlines({ purchaseDate: '2016-04-01' }).sellBy).toBe('2019-04-01');
        for (const input of [
            undefined,
            null,
            {},
            { purchaseDate: 20250601 },
            { purchaseDate: '2025-06-10', saleDate: null },
        ])
            expect(() => getRefundDeadlines(input as never)).toThrow(RangeError);
        expect(() => resolveBuyer(undefined as never)).toThrow(RangeError);
        expect(() => getHigherRatesRefund(null as never)).toThrow(RangeError);
    });
});
