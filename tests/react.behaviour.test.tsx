import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { PdfImage } from '../src/pdf/index';
import { amountText, Hints, oneOf, parseAmount, Status, statusText } from '../src/react/fields';
import * as components from '../src/react/index';
import { downloadPdfFile, PDF_FAILED_MESSAGE } from '../src/react/pdf-download';
import { slots } from '../src/react/shared';
import { BUYER_TYPES } from '../src/stamp-duty/estimate';

/* Behaviour that static markup of a whole component can't show, tested without a DOM. */

const html = renderToStaticMarkup;
const cx = slots(undefined);

describe('parseAmount', () => {
    it('reads pounds, commas, pence and a leading £', () => {
        expect(parseAmount('500000', Number.NaN)).toBe(500_000);
        expect(parseAmount(' £1,250,000 ', Number.NaN)).toBe(1_250_000);
        expect(parseAmount('£ 1250.50', Number.NaN)).toBe(1_250.5);
        expect(parseAmount('.5', Number.NaN)).toBe(0.5);
        expect(parseAmount('12.', Number.NaN)).toBe(12);
    });

    it('reads k and m as thousands and millions, exactly', () => {
        expect(parseAmount('1.5m', Number.NaN)).toBe(1_500_000);
        expect(parseAmount('750k', Number.NaN)).toBe(750_000);
        expect(parseAmount('£2.3 M', Number.NaN)).toBe(2_300_000);
        expect(parseAmount('1,250K', Number.NaN)).toBe(1_250_000);
    });

    it('gives the fallback for an empty box', () => {
        expect(parseAmount('', 0)).toBe(0);
        expect(parseAmount('   ', Number.NaN)).toBeNaN();
    });

    it('refuses anything else instead of guessing', () => {
        for (const text of ['-500', '1e6', 'abc', '1.2.3', '£', '.', 'k', '1 000', '5 mm', '12b', '+5', ',5'])
            expect(parseAmount(text, 0), text).toBeNaN();
    });
});

describe('amountText and oneOf', () => {
    it('keeps pence when the amount has them', () => {
        expect(amountText(750_000)).toBe('750,000');
        expect(amountText(350.5)).toBe('350.50');
        expect(amountText(1_384.61)).toBe('1,384.61');
        expect(amountText(undefined)).toBe('');
        expect(amountText(0)).toBe('');
    });

    it('round-trips through parseAmount', () => {
        for (const value of [1, 350.5, 1_384.61, 2_000_000]) expect(parseAmount(amountText(value), 0)).toBe(value);
    });

    it('falls back for a value that is not an option', () => {
        expect(oneOf(BUYER_TYPES, 'first-time-buyer', 'home-mover')).toBe('first-time-buyer');
        expect(oneOf(BUYER_TYPES, 'bogus', 'home-mover')).toBe('home-mover');
        expect(oneOf(BUYER_TYPES, null, 'home-mover')).toBe('home-mover');
    });
});

describe('the status region', () => {
    const headline = { label: 'Monthly payment', formatted: '£2,338.36' };

    it('says the error, else the headline, else nothing', () => {
        expect(statusText('Enter the rent.', headline)).toBe('Enter the rent.');
        expect(statusText(null, headline)).toBe('Monthly payment: £2,338.36');
        expect(statusText(null, null)).toBe('');
        expect(statusText(undefined)).toBe('');
    });

    it('is one always-mounted element, marked as an error or a result', () => {
        expect(html(<Status cx={cx} id="s" error="Enter the rent." headline={headline} />)).toBe(
            '<p id="s" class="pc-status" role="status" data-state="error">Enter the rent.</p>',
        );
        expect(html(<Status cx={cx} id="s" error={null} headline={headline} />)).toBe(
            '<p id="s" class="pc-status" role="status" data-state="result">Monthly payment: £2,338.36</p>',
        );
        expect(html(<Status cx={cx} id="s" />)).toBe(
            '<p id="s" class="pc-status" role="status" data-state="result"></p>',
        );
    });

    it('holds the headline only, with the rows and the table outside any live region', () => {
        const markup = html(<components.StampDutyCalculator defaultPrice={750_000} pdf />);
        expect(markup).toContain('role="status" data-state="result">Stamp Duty to pay: £27,500</p>');
        expect(markup).not.toContain('aria-live');
        // The calculator's region, and the download button's: both present before anything is announced.
        expect(markup.match(/role="status"/g)).toHaveLength(2);
        expect(html(<components.MortgageCalculator defaultPrice={500_000} />)).toMatch(
            /data-state="result">Monthly payment: £[\d,.]+<\/p><dl class="pc-rows">/,
        );
    });

    it('ties the error to the form, and to the price box where that is the field at fault', () => {
        const mortgage = html(<components.MortgageCalculator defaultPrice={500_000} defaultRate={40} />);
        const id = /<p id="([^"]+)" class="pc-status"/.exec(mortgage)?.[1];
        expect(mortgage).toContain(`<div class="pc-form" data-layout="grid" aria-describedby="${id}">`);
        expect(html(<components.MortgageCalculator defaultPrice={500_000} />)).not.toContain('aria-describedby');

        const tooHigh = html(<components.StampDutyCalculator defaultPrice={2_000_000_000} />);
        expect(tooHigh).toMatch(/aria-invalid="true" aria-describedby="[^"]+" value="2,000,000,000"/);
        const empty = html(<components.StampDutyCalculator />);
        expect(empty).not.toContain('aria-invalid');
        expect(empty).toContain('aria-describedby');
    });
});

describe('Hints', () => {
    it('renders a repeated line twice without a duplicate-key warning', () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const markup = html(<Hints cx={cx} lines={['Same.', null, 'Same.']} />);
        expect(markup).toBe('<p class="pc-hint">Same.</p><p class="pc-hint">Same.</p>');
        expect(error).not.toHaveBeenCalled();
        error.mockRestore();
    });
});

describe('downloadPdfFile', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const prepared = { filter: 'DCTDecode', data: bytes, width: 1, height: 1 } as unknown as PdfImage;
    const fakeApi = (pdfImage: () => Promise<PdfImage> = async () => prepared) => ({ pdfImage, downloadPdf: vi.fn() });

    it('saves the file and reports nothing when all is well', async () => {
        const api = fakeApi();
        const result = await downloadPdfFile({
            load: async () => api,
            make: async () => bytes,
            options: {},
            filename: 'a.pdf',
        });
        expect(result).toBeNull();
        expect(api.downloadPdf).toHaveBeenCalledWith(bytes, 'a.pdf');
    });

    it('reports a failed build to onError and with a message, without retrying or rejecting', async () => {
        const api = fakeApi();
        const failure = new Error('boom');
        const make = vi.fn().mockRejectedValue(failure);
        const onError = vi.fn();
        const result = await downloadPdfFile({
            load: async () => api,
            make,
            options: { name: 'Acme' },
            filename: 'a.pdf',
            onError,
        });
        expect(result).toBe(PDF_FAILED_MESSAGE);
        expect(result).toBe('The PDF could not be created.');
        expect(onError).toHaveBeenCalledWith(failure);
        expect(make).toHaveBeenCalledTimes(1);
        expect(api.downloadPdf).not.toHaveBeenCalled();
    });

    it('reports a failed import of the PDF code, and survives an onError that throws', async () => {
        const failure = new Error('chunk failed to load');
        const onError = vi.fn(() => {
            throw new Error('handler bug');
        });
        const load = () => Promise.reject<ReturnType<typeof fakeApi>>(failure);
        await expect(
            downloadPdfFile({ load, make: async () => bytes, options: {}, filename: 'a.pdf', onError }),
        ).resolves.toBe(PDF_FAILED_MESSAGE);
        expect(onError).toHaveBeenCalledWith(failure);
    });

    it('leaves out a logo that fails to load, and nothing else', async () => {
        const api = fakeApi(() => Promise.reject(new Error('404')));
        const make = vi.fn().mockResolvedValue(bytes);
        const onError = vi.fn();
        const options = { name: 'Acme', logo: '/missing.png' };
        expect(await downloadPdfFile({ load: async () => api, make, options, filename: 'a.pdf', onError })).toBeNull();
        expect(make).toHaveBeenCalledWith(api, { name: 'Acme', logo: undefined });
        expect(onError).not.toHaveBeenCalled();
        expect(api.downloadPdf).toHaveBeenCalledWith(bytes, 'a.pdf');
    });

    it('passes a logo that loads on to the build, decoded once', async () => {
        const api = fakeApi();
        const make = vi.fn().mockResolvedValue(bytes);
        await downloadPdfFile({ load: async () => api, make, options: { logo: '/logo.png' }, filename: 'a.pdf' });
        expect(make).toHaveBeenCalledWith(api, { logo: prepared });
    });
});
