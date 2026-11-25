/*
 * Inflate and deflate (zlib format) in plain JavaScript, for engines without
 * `DecompressionStream` and `CompressionStream`: React Native's Hermes, chiefly. `png.ts` uses
 * the built-in streams where they exist and these where they do not.
 *
 * The inflater reads every kind of block. The deflater is a small one: fixed Huffman codes and
 * the nearest earlier match, which is plenty for the flat colour of a logo.
 */

const bad = () => new RangeError('That is not valid deflate data.');

const LENGTH_BASE = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
];
const LENGTH_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DISTANCE_BASE = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
    8193, 12289, 16385, 24577,
];
const DISTANCE_EXTRA = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
/** The order a block lists the lengths of its code-length codes in. */
const CODE_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
const WINDOW = 32768;

/** The checksum zlib ends its data with. */
function adler32(data: Uint8Array): number {
    let [a, b] = [1, 0];
    for (let at = 0; at < data.length;) {
        // As many bytes as fit before the sums could overflow.
        const end = Math.min(at + 5552, data.length);
        for (; at < end; at++) b += a += data[at]!;
        a %= 65521;
        b %= 65521;
    }
    return ((b << 16) | a) >>> 0;
}

/** A Huffman code: how many codes there are of each length, and the symbols in code order. */
type Huffman = { counts: Uint16Array; symbols: Uint16Array };

function huffman(lengths: ArrayLike<number>): Huffman {
    const counts = new Uint16Array(16);
    const symbols = new Uint16Array(lengths.length);
    for (let i = 0; i < lengths.length; i++) counts[lengths[i]!]!++;
    counts[0] = 0;
    const offsets = new Uint16Array(16);
    for (let length = 1; length < 16; length++) offsets[length] = offsets[length - 1]! + counts[length - 1]!;
    for (let i = 0; i < lengths.length; i++) if (lengths[i]) symbols[offsets[lengths[i]!]!++] = i;
    return { counts, symbols };
}

const FIXED_LENGTHS = new Uint8Array(288).fill(8, 0, 144).fill(9, 144, 256).fill(7, 256, 280).fill(8, 280);
let fixed: [Huffman, Huffman] | undefined;

/**
 * Inflates zlib `data`, which must come to exactly `size` bytes. Throws a `RangeError` when it is
 * longer, shorter, cut off, fails its checksum, has anything after it or is not zlib data at all.
 */
export function inflateZlib(data: Uint8Array, size: number): Uint8Array {
    if (data.length < 6 || (data[0]! & 15) !== 8 || ((data[0]! << 8) | data[1]!) % 31 || data[1]! & 32) throw bad();
    const out = new Uint8Array(size);
    let [at, buffer, held, written] = [2, 0, 0, 0];
    const bits = (count: number) => {
        while (held < count) {
            if (at >= data.length) throw bad();
            buffer |= data[at++]! << held;
            held += 8;
        }
        const value = buffer & ((1 << count) - 1);
        buffer >>>= count;
        held -= count;
        return value;
    };
    const symbol = ({ counts, symbols }: Huffman) => {
        let [code, first, index] = [0, 0, 0];
        for (let length = 1; length < 16; length++) {
            code |= bits(1);
            const count = counts[length]!;
            if (code - count < first) return symbols[index + (code - first)]!;
            index += count;
            first = (first + count) << 1;
            code <<= 1;
        }
        throw bad();
    };

    for (let last = 0; !last;) {
        last = bits(1);
        const type = bits(2);
        if (type === 0) {
            // Stored: the bytes as they are, from the next whole byte.
            buffer = held = 0;
            const length = data[at]! | (data[at + 1]! << 8);
            if (at + 4 > data.length || (length ^ 0xffff) !== (data[at + 2]! | (data[at + 3]! << 8))) throw bad();
            at += 4;
            if (at + length > data.length || written + length > size) throw bad();
            out.set(data.subarray(at, at + length), written);
            at += length;
            written += length;
            continue;
        }
        if (type === 3) throw bad();
        let [literals, distances] = (fixed ??= [huffman(FIXED_LENGTHS), huffman(new Uint8Array(30).fill(5))]);
        if (type === 2) {
            const [literalCount, distanceCount, codeCount] = [bits(5) + 257, bits(5) + 1, bits(4) + 4];
            const codeLengths = new Uint8Array(19);
            for (let i = 0; i < codeCount; i++) codeLengths[CODE_ORDER[i]!] = bits(3);
            const codes = huffman(codeLengths);
            const lengths = new Uint8Array(literalCount + distanceCount);
            for (let i = 0; i < lengths.length;) {
                const code = symbol(codes);
                if (code < 16) {
                    lengths[i++] = code;
                    continue;
                }
                // 16 repeats the last length; 17 and 18 are runs of zeros.
                if (code === 16 && i === 0) throw bad();
                const repeat = code === 16 ? 3 + bits(2) : code === 17 ? 3 + bits(3) : 11 + bits(7);
                if (i + repeat > lengths.length) throw bad();
                lengths.fill(code === 16 ? lengths[i - 1]! : 0, i, i + repeat);
                i += repeat;
            }
            literals = huffman(lengths.subarray(0, literalCount));
            distances = huffman(lengths.subarray(literalCount));
        }
        for (;;) {
            const code = symbol(literals);
            if (code === 256) break;
            if (code < 256) {
                if (written >= size) throw bad();
                out[written++] = code;
                continue;
            }
            if (code > 285) throw bad();
            const length = LENGTH_BASE[code - 257]! + bits(LENGTH_EXTRA[code - 257]!);
            const slot = symbol(distances);
            if (slot > 29) throw bad();
            const distance = DISTANCE_BASE[slot]! + bits(DISTANCE_EXTRA[slot]!);
            if (distance > written || written + length > size) throw bad();
            // Byte by byte: a match may run into the bytes it is itself writing.
            for (let i = 0; i < length; i++, written++) out[written] = out[written - distance]!;
        }
    }
    // The checksum follows the last block, from the next whole byte, and nothing follows that.
    if (written !== size || at + 4 !== data.length) throw bad();
    const sum = ((data[at]! << 24) | (data[at + 1]! << 16) | (data[at + 2]! << 8) | data[at + 3]!) >>> 0;
    if (sum !== adler32(out)) throw bad();
    return out;
}

/** Deflates `data` into zlib format, as one block of fixed Huffman codes. */
export function deflateZlib(data: Uint8Array): Uint8Array {
    // At worst every byte is a 9-bit literal.
    const out = new Uint8Array(data.length + (data.length >> 3) + 16);
    out[0] = 0x78;
    out[1] = 0x9c;
    let [at, buffer, held] = [2, 0, 0];
    const put = (value: number, count: number) => {
        buffer |= value << held;
        held += count;
        for (; held >= 8; held -= 8, buffer >>>= 8) out[at++] = buffer & 0xff;
    };
    /** Huffman codes go in from their top bit; everything else from the bottom. */
    const code = (value: number, count: number) => {
        let reversed = 0;
        for (let i = 0; i < count; i++) reversed |= ((value >> i) & 1) << (count - 1 - i);
        put(reversed, count);
    };
    const literal = (value: number) =>
        value < 144
            ? code(0x30 + value, 8)
            : value < 256
              ? code(0x190 + value - 144, 9)
              : value < 280
                ? code(value - 256, 7)
                : code(0xc0 + value - 280, 8);

    put(1, 1);
    put(1, 2);
    // Where each run of three bytes was last seen.
    const seen = new Int32Array(WINDOW).fill(-1);
    for (let i = 0; i < data.length;) {
        let length = 0;
        let from = -1;
        if (i + 2 < data.length) {
            const hash = ((data[i]! << 10) ^ (data[i + 1]! << 5) ^ data[i + 2]!) & (WINDOW - 1);
            from = seen[hash]!;
            seen[hash] = i;
            if (from >= 0 && i - from <= WINDOW)
                while (length < 258 && i + length < data.length && data[from + length] === data[i + length]) length++;
        }
        if (length < 3) {
            literal(data[i++]!);
            continue;
        }
        let slot = 28;
        while (LENGTH_BASE[slot]! > length) slot--;
        literal(257 + slot);
        put(length - LENGTH_BASE[slot]!, LENGTH_EXTRA[slot]!);
        slot = 29;
        while (DISTANCE_BASE[slot]! > i - from) slot--;
        code(slot, 5);
        put(i - from - DISTANCE_BASE[slot]!, DISTANCE_EXTRA[slot]!);
        i += length;
    }
    literal(256);
    if (held) put(0, 8 - held);
    const sum = adler32(data);
    out.set([sum >>> 24, (sum >> 16) & 0xff, (sum >> 8) & 0xff, sum & 0xff], at);
    return out.slice(0, at + 4);
}
