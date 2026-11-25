import { describe, expect, it } from 'vitest';

import { createPdf } from '../src/pdf/index';
import { clampLines, encodeText, infoString, literal, textWidth, wrapText } from '../src/pdf/text';
import { BASE, DATE, readText } from './pdf.helpers';

const WIN_ANSI_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

describe('encoding text for the built-in font', () => {
    it('has every character WinAnsi adds to Latin-1', () => {
        const codes = [0x80, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8c, 0x8e];
        codes.push(0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0x9b, 0x9c, 0x9e, 0x9f);
        expect(encodeText(WIN_ANSI_EXTRAS)).toEqual(codes);
        expect(encodeText('£é ÿ ')).toEqual([0xa3, 0xe9, 0x20, 0xff, 0xa0]);
    });

    it('composes accents, falls back to the base letter, and prints ? for the rest', () => {
        // The last é is an e followed by a combining accent.
        expect(literal('€ • ™ ŵ ŷ Ł é ’ 😀 é')).toBe('(\\200 \\225 \\231 w y ? \\351 \\222 ? \\351)');
        expect(literal('Ŵ Čapek ő x́ 日本')).toBe('(W Capek o x ??)');
        expect(literal('1−‑ 2')).toBe('(1-- 2)');
    });

    it('prints raw control characters as ?, never as the glyph that shares their code', () => {
        expect(literal('\u0096\u0080\u009f')).toBe('(???)');
        expect(literal('a\nb\tc\u007f')).toBe('(a?b?c?)');
    });

    it('escapes whatever could end the string early', () => {
        expect(literal(') Tj ET BT (x')).toBe('(\\) Tj ET BT \\(x)');
        expect(literal('\\) Tj')).toBe('(\\\\\\) Tj)');
    });

    it('prints the special characters in a finished PDF', async () => {
        const subtitle = 'Smith’s “Café” – €5 • 10‰ … Łódź ŵy 😀';
        const printed = readText(await createPdf(BASE, { date: DATE, subtitle }));
        expect(printed).toContain('Smith’s “Café” – €5 • 10‰ … ?ódz wy ?');
    });

    it('writes document properties as ASCII or as UTF-16 with a byte order mark', () => {
        expect(infoString('Acme (UK)')).toBe('(Acme \\(UK\\))');
        expect(infoString('a\nb')).toBe('(a b)');
        expect(infoString('é😀')).toBe('<FEFF00E9D83DDE00>');
    });
});

describe('measuring and wrapping', () => {
    it('measures with the metrics of the character actually printed', () => {
        expect(textWidth('£1,250,000', 10)).toBeCloseTo(50.04);
        expect(textWidth('é', 10)).toBe(textWidth('e', 10));
        expect(textWidth('Ŵ', 10, true)).toBe(textWidth('W', 10, true));
        expect(textWidth('é', 10)).toBe(textWidth('e', 10));
        expect(textWidth('m²', 10)).toBeCloseTo(8.33 + 3.33);
        expect(textWidth('\u007f', 10)).toBe(textWidth('?', 10));
    });

    it('breaks at spaces, at newlines and inside a word that is too long', () => {
        expect(wrapText('one two\nthree\r\nfour\rfive', 10, 500)).toEqual(['one two', 'three', 'four', 'five']);
        expect(wrapText('  a \t b\u0000c  ', 10, 500)).toEqual(['a b c']);
        expect(wrapText(' \n ', 10, 500)).toEqual([]);
        const lines = wrapText(`https://example.com/${'a'.repeat(200)} tail`, 8.5, 483);
        expect(lines.length).toBe(3);
        for (const line of lines) expect(textWidth(line, 8.5)).toBeLessThanOrEqual(483);
        expect(lines.join('')).toBe(`https://example.com/${'a'.repeat(200)} tail`);
        // Narrower than any character: one character a line, and no endless loop.
        expect(wrapText('abc', 10, 1)).toEqual(['a', 'b', 'c']);
        // Bold text is wider, so it wraps sooner.
        const fitsRegular = textWidth('Total to pay now', 10);
        expect(wrapText('Total to pay now', 10, fitsRegular)).toEqual(['Total to pay now']);
        expect(wrapText('Total to pay now', 10, fitsRegular, true)).toEqual(['Total to pay', 'now']);
        // A non-breaking space keeps its words together.
        expect(wrapText('aaaa 10 000 bbbb', 10, 50)).toEqual(['aaaa', '10 000', 'bbbb']);
    });

    it('cuts a run of lines short with an ellipsis', () => {
        expect(clampLines(['a', 'b'], 3)).toEqual(['a', 'b']);
        expect(clampLines(['one', 'two', 'three', 'four'], 3)).toEqual(['one', 'two', 'thre…']);
    });
});
