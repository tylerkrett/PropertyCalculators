import { formatRate } from '../stamp-duty/format';
import { CAPITAL_GAINS_REPORTING_DAYS, formatIsoDate } from './rates';

/*
 * The plain-English notes that go with a capital gains result: what it assumes, what it leaves
 * out, and what to do next.
 */

/** The small print shown with every result and printed on the PDF. */
export const CAPITAL_GAINS_NOTICE =
    'This is a guide only, not tax advice. It covers a UK resident selling a residential property and does not allow for private residence relief, losses brought forward or other gains. Check your own position with HMRC or a tax adviser.';

/** The figures the notes are chosen from. */
interface NoteFacts {
    gain: number;
    loss: boolean;
    tax: number;
    reportBy?: string;
}

/** The notes for a result, most relevant first. `share` is the percent of the property owned. */
export function capitalGainsNotes({ gain, loss, tax, reportBy }: NoteFacts, share: number): string[] {
    const notes: string[] = [];
    if (loss) {
        // https://www.gov.uk/capital-gains-tax/losses: a loss must be claimed within four years of the end of the tax year.
        notes.push(
            'The sale made a loss, so there is no capital gains tax to pay. Report the loss to HMRC within four years of the end of the tax year and it can be carried forward and set against later gains.',
        );
    } else if (tax === 0) {
        notes.push(
            gain > 0
                ? 'The gain is covered by the tax-free allowance, so there is no capital gains tax to pay.'
                : 'The sale made no gain, so there is no capital gains tax to pay.',
        );
    }
    if (reportBy) {
        notes.push(
            tax > 0
                ? `Report the sale to HMRC and pay the tax by ${formatIsoDate(reportBy)}: ${CAPITAL_GAINS_REPORTING_DAYS} days after completion.`
                : `With no tax to pay, a UK resident does not usually need to send the ${CAPITAL_GAINS_REPORTING_DAYS}-day return, which would be due by ${formatIsoDate(reportBy)}.`,
        );
    }
    if (share < 100) notes.push(`The figures are for your ${formatRate(share)} share of the property.`);
    notes.push(
        'Private residence relief and lettings relief are not modelled. If the property was your main home at any time, the tax may be lower.',
        'Income is taken as entered. Pension contributions and Gift Aid donations, which widen the basic-rate band, are not allowed for.',
    );
    return notes;
}
