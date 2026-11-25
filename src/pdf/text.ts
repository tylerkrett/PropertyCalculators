/*
 * Text as the built-in Helvetica faces take it. No font is embedded, so only the characters of
 * WinAnsi (Latin-1 plus the euro, curly quotes, dashes, bullet and a few more) can be printed.
 * An accented letter outside that set prints as its base letter (ŵ as w); anything else, such as
 * Greek, Cyrillic, Chinese or an emoji, prints as `?`.
 */

/** The characters WinAnsi keeps at 0x80 to 0x9F, in order; `\0` marks a code it leaves unused. */
const HIGH =
    '\u20ac\0\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\0\u017d\0' +
    '\0\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\0\u017e\u0178';
const WIN_ANSI = new Map<string, number>();
[...HIGH].forEach((char, index) => char !== '\0' && WIN_ANSI.set(char, 0x80 + index));

/** Look-alikes for characters the font lacks: the minus sign and the hyphens that are not `-`. */
const SUBSTITUTES: Record<string, string> = { '\u2212': '-', '\u2010': '-', '\u2011': '-', '\u2044': '/' };
/** Characters that take no space of their own: combining marks and zero-width joiners. */
const INVISIBLE = /[\p{M}\u200b-\u200d\u2060\ufeff]/u;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const UNKNOWN = 63; // "?"

/** The WinAnsi byte for one character, or `undefined` when the font has nothing for it. */
function byteOf(char: string): number | undefined {
    const code = char.codePointAt(0)!;
    if ((code >= 32 && code < 127) || (code >= 160 && code <= 255)) return code;
    // Below 160 only control characters are left, the raw C1 controls among them.
    if (code < 160) return undefined;
    const mapped = WIN_ANSI.get(char);
    if (mapped) return mapped;
    const substitute = SUBSTITUTES[char];
    if (substitute) return substitute.charCodeAt(0);
    if (/\s/.test(char)) return 32;
    const [base] = char.normalize('NFD');
    return base && base !== char ? byteOf(base) : undefined;
}

/** `text` as the bytes the font prints, one per visible character, with `?` for the unprintable. */
export function encodeText(text: string): number[] {
    const bytes: number[] = [];
    for (const char of text.normalize('NFC')) {
        const code = char.charCodeAt(0);
        if (code >= 32 && code < 127) bytes.push(code);
        else if (!INVISIBLE.test(char)) bytes.push(byteOf(char) ?? UNKNOWN);
    }
    return bytes;
}

/** A PDF string literal in plain ASCII: other characters become octal escapes, or `?` if the font lacks them. */
export function literal(text: string): string {
    let out = '';
    for (const byte of encodeText(text)) {
        if (byte === 40 || byte === 41 || byte === 92) out += `\\${String.fromCharCode(byte)}`;
        else out += byte < 127 ? String.fromCharCode(byte) : `\\${byte.toString(8)}`;
    }
    return `(${out})`;
}

/**
 * A string for the document's properties, which are not printed in a font and so can hold any
 * character: plain ASCII as it is, anything else as UTF-16BE hex behind a byte order mark.
 */
export function infoString(text: string): string {
    const clean = text.replace(CONTROL, ' ');
    if (/^[\x20-\x7e]*$/.test(clean)) return literal(clean);
    let hex = 'FEFF';
    for (let i = 0; i < clean.length; i++) hex += clean.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase();
    return `<${hex}>`;
}

// Advance widths per 1000 units for ASCII 32 to 126, from Adobe's metrics for the two faces.
const REGULAR =
    '278 278 355 556 556 889 667 191 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 278 278 584 584 584 556 1015 667 667 722 722 667 611 778 722 278 500 667 556 833 722 778 667 778 722 667 611 722 667 944 667 667 611 278 278 278 469 556 333 556 556 500 556 556 278 556 556 222 222 500 222 833 556 556 556 556 333 500 278 556 500 722 500 500 500 334 260 334 584';
const BOLD =
    '278 333 474 556 556 889 722 238 333 333 389 584 278 333 278 278 556 556 556 556 556 556 556 556 556 556 333 333 584 584 584 611 975 722 722 722 722 667 611 778 722 278 556 722 611 833 722 778 667 778 722 667 611 722 667 944 667 667 611 333 278 333 584 556 333 556 611 556 611 556 333 611 611 278 278 556 278 889 611 611 611 611 389 556 333 611 556 778 556 556 500 389 280 389 584';
/** Widths of the commoner characters past ASCII; the rest take their base letter's, or 556. */
const OTHER: Record<string, number> = {
    '\u2014': 1000,
    '\u2026': 1000,
    '\u00b7': 278,
    '\u2019': 250,
    '\u2018': 250,
    '\u00a0': 278,
    '\u2022': 350,
    '\u2122': 1000,
    '\u2030': 1000,
    '\u0152': 1000,
    '\u0153': 944,
    '\u201c': 333,
    '\u201d': 333,
    '\u201e': 333,
    '\u201a': 222,
    '\u2039': 333,
    '\u203a': 333,
    '\u02c6': 333,
    '\u02dc': 333,
    '\u00b0': 400,
    '\u00b2': 333,
    '\u00b3': 333,
    '\u00a9': 737,
    '\u00ae': 737,
    '\u00bd': 834,
    '\u00bc': 834,
    '\u00be': 834,
};

/** A width for each of the 256 bytes: the metrics for ASCII, then the best available for the rest. */
function widthTable(metrics: string): number[] {
    const ascii = metrics.split(' ').map(Number);
    return Array.from({ length: 256 }, (_, byte) => {
        if (byte < 0x80) return ascii[byte - 32] ?? 556;
        const char = byte < 160 ? HIGH[byte - 0x80]! : String.fromCharCode(byte);
        const base = char.normalize('NFD').charCodeAt(0);
        return OTHER[char] ?? (base < 127 ? ascii[base - 32] : undefined) ?? 556;
    });
}
const WIDTHS = [widthTable(REGULAR), widthTable(BOLD)];

/** How wide `text` prints at `size` points. */
export function textWidth(text: string, size: number, bold = false): number {
    const widths = WIDTHS[bold ? 1 : 0]!;
    let units = 0;
    for (const byte of encodeText(text)) units += widths[byte]!;
    return (units * size) / 1000;
}

/**
 * Breaks text into lines no wider than `maxWidth` points. A newline starts a new line, other
 * control characters count as a space, lines break at spaces, and a word too long for a line
 * (a web address, say) is broken wherever it has to be.
 */
export function wrapText(text: string, size: number, maxWidth: number, bold = false): string[] {
    const lines: string[] = [];
    const fits = (value: string) => textWidth(value, size, bold) <= maxWidth;
    for (const paragraph of text.normalize('NFC').split(/\r\n|[\n\r\u2028\u2029]/)) {
        let line = '';
        // A non-breaking space is the one kind of space that must not end a line.
        for (const word of paragraph.replace(CONTROL, ' ').split(/[^\S\u00a0]+/)) {
            if (!word) continue;
            const next = line ? `${line} ${word}` : word;
            if (fits(next)) {
                line = next;
                continue;
            }
            if (line) lines.push(line);
            line = word;
            if (fits(word)) continue;
            // Too long even alone: fill each line with as many characters as it holds.
            let used = 0;
            line = '';
            for (const char of word) {
                const width = textWidth(char, size, bold);
                if (line && used + width > maxWidth) {
                    lines.push(line);
                    [line, used] = ['', 0];
                }
                line += char;
                used += width;
            }
        }
        if (line) lines.push(line);
    }
    return lines;
}

/** Keeps the first `max` lines, ending the last with an ellipsis when some were dropped. */
export function clampLines(lines: string[], max: number): string[] {
    if (lines.length <= max) return lines;
    const kept = lines.slice(0, max);
    kept[max - 1] = `${kept[max - 1]!.slice(0, -1)}\u2026`;
    return kept;
}
