/*
 * UTF-8 and base64 in plain JavaScript. Browsers and Node have `TextEncoder`, `TextDecoder`,
 * `btoa` and `atob`, but React Native's Hermes engine has lacked some of them, so nothing in the
 * package depends on those globals.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const REPLACEMENT = 0xfffd;
const REPLACEMENT_TEXT = '\ufffd';

/** The UTF-8 bytes of `text`, as `new TextEncoder().encode(text)` gives them. */
export function utf8Encode(text: string): Uint8Array {
    const out = new Uint8Array(text.length * 3);
    let at = 0;
    for (let i = 0; i < text.length; i++) {
        let code = text.charCodeAt(i);
        if (code >= 0xd800 && code <= 0xdfff) {
            const low = code <= 0xdbff ? text.charCodeAt(i + 1) : Number.NaN;
            // A surrogate pair is one character; half of one cannot be written and is replaced.
            if (low >= 0xdc00 && low <= 0xdfff) {
                code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
                i++;
            } else code = REPLACEMENT;
        }
        if (code < 0x80) out[at++] = code;
        else if (code < 0x800) {
            out[at++] = 0xc0 | (code >> 6);
            out[at++] = 0x80 | (code & 63);
        } else if (code < 0x10000) {
            out[at++] = 0xe0 | (code >> 12);
            out[at++] = 0x80 | ((code >> 6) & 63);
            out[at++] = 0x80 | (code & 63);
        } else {
            out[at++] = 0xf0 | (code >> 18);
            out[at++] = 0x80 | ((code >> 12) & 63);
            out[at++] = 0x80 | ((code >> 6) & 63);
            out[at++] = 0x80 | (code & 63);
        }
    }
    return out.slice(0, at);
}

/**
 * Reads UTF-8 bytes as text, exactly as `new TextDecoder().decode(bytes)` does: a leading byte
 * order mark is dropped, and each run of bytes that is not UTF-8 becomes one U+FFFD.
 */
export function utf8Decode(bytes: Uint8Array): string {
    let text = '';
    // A character in progress: its value so far, the bytes it still needs, and what the next may be.
    let [code, needed, lower, upper] = [0, 0, 0x80, 0xbf];
    for (let i = 0; i < bytes.length; i++) {
        const byte = bytes[i]!;
        if (needed === 0) {
            if (byte < 0x80) text += String.fromCharCode(byte);
            else if (byte >= 0xc2 && byte <= 0xdf) [code, needed] = [byte & 0x1f, 1];
            else if (byte >= 0xe0 && byte <= 0xef) {
                // The first continuation byte is narrowed to rule out short forms and surrogates.
                if (byte === 0xe0) lower = 0xa0;
                if (byte === 0xed) upper = 0x9f;
                [code, needed] = [byte & 0x0f, 2];
            } else if (byte >= 0xf0 && byte <= 0xf4) {
                if (byte === 0xf0) lower = 0x90;
                if (byte === 0xf4) upper = 0x8f;
                [code, needed] = [byte & 0x07, 3];
            } else text += REPLACEMENT_TEXT;
            continue;
        }
        const fits = byte >= lower && byte <= upper;
        [lower, upper] = [0x80, 0xbf];
        if (!fits) {
            // The broken character is replaced, and this byte is read again as a fresh start.
            needed = 0;
            text += REPLACEMENT_TEXT;
            i--;
            continue;
        }
        code = (code << 6) | (byte & 0x3f);
        if (--needed === 0) text += String.fromCodePoint(code);
    }
    if (needed) text += REPLACEMENT_TEXT;
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Standard base64, with padding: what `btoa` gives for the same bytes. */
export function base64Encode(bytes: Uint8Array): string {
    let text = '';
    for (let i = 0; i < bytes.length; i += 3) {
        const [a, b, c] = [bytes[i]!, bytes[i + 1], bytes[i + 2]];
        text += ALPHABET[a >> 2]! + ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
        text += b === undefined ? '=' : ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
        text += c === undefined ? '=' : ALPHABET[c & 63]!;
    }
    return text;
}

/**
 * Reads standard base64 by `atob`'s rules: spaces and line breaks are skipped and the padding may
 * be left off. Throws a `TypeError` for anything else that is not base64.
 */
export function base64Decode(text: string): Uint8Array {
    let clean = String(text).replace(/[\t\n\f\r ]/g, '');
    if (clean.length % 4 === 0) clean = clean.replace(/={1,2}$/, '');
    if (clean.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(clean)) throw new TypeError('That is not base64.');
    const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
    let [bits, count, at] = [0, 0, 0];
    for (let i = 0; i < clean.length; i++) {
        bits = ((bits << 6) | ALPHABET.indexOf(clean[i]!)) & 0xffffff;
        count += 6;
        if (count >= 8) {
            count -= 8;
            out[at++] = (bits >> count) & 0xff;
        }
    }
    return out;
}
