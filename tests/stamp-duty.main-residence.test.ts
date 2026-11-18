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
        expect(getRefundDeadlines({ purchaseDate: '2025-06-10', saleDate: '2026-02-01' })).toMatchObject({
            claimBy: '2027-02-01',
            soldInTime: true,
        });
        // Sold before the return was due: the clock runs from the filing date.
        expect(getRefundDeadlines({ purchaseDate: '2025-06-10', saleDate: '2025-06-12' }).claimBy).toBe('2026-06-24');
        expect(getRefundDeadlines({ purchaseDate: '2025-06-10', saleDate: '2028-06-11' }).soldInTime).toBe(false);
        expect(getRefundDeadlines({ purchaseDate: '2024-02-29' }).sellBy).toBe('2027-02-28');
    });

    it('rejects bad dates', () => {
        expect(() => getRefundDeadlines({ purchaseDate: '10/06/2025' })).toThrow(RangeError);
        expect(() => getRefundDeadlines({ purchaseDate: '2025-02-30' })).toThrow(RangeError);
        expect(() => getRefundDeadlines({ purchaseDate: '2025-06-10', saleDate: 'soon' })).toThrow(RangeError);
    });
});
