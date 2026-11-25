import { type HTMLAttributes, useState } from 'react';

import type { PdfOptions } from '../pdf/index';

import { downloadPdfFile, type PdfApi } from './pdf-download';
import { STYLES } from './styles';

/*
 * The components look finished with no setup: each one carries the default stylesheet with it.
 * To restyle, set the `--pc-*` variables, add classes per part with `classNames`, or pass
 * `unstyled` and write your own CSS against the stable `pc-*` class on every element.
 */

export type Slot =
    | 'root'
    | 'form'
    | 'field'
    | 'label'
    | 'money'
    | 'prefix'
    | 'input'
    | 'select'
    | 'options'
    | 'option'
    | 'check'
    | 'summary'
    | 'summaryItem'
    | 'heading'
    | 'table'
    | 'rows'
    | 'row'
    | 'hint'
    | 'status'
    | 'download'
    | 'display'
    | 'pads'
    | 'pad'
    | 'key';

export type ClassNames = Partial<Record<Slot, string>>;

const BASE: Record<Slot, string> = {
    root: 'pc',
    form: 'pc-form',
    field: 'pc-field',
    label: 'pc-label',
    money: 'pc-money',
    prefix: 'pc-prefix',
    input: 'pc-input',
    select: 'pc-select',
    options: 'pc-options',
    option: 'pc-option',
    check: 'pc-check',
    summary: 'pc-summary',
    summaryItem: 'pc-summary-item',
    heading: 'pc-heading',
    table: 'pc-table',
    rows: 'pc-rows',
    row: 'pc-row',
    hint: 'pc-hint',
    status: 'pc-status',
    download: 'pc-download',
    display: 'pc-display',
    pads: 'pc-pads',
    pad: 'pc-pad',
    key: 'pc-key',
};

/** Builds the class for a part: its `pc-*` class, then anything the caller added. */
export function slots(classNames: ClassNames | undefined, ...extraRoot: (string | false | undefined)[]) {
    return (slot: Slot) =>
        [BASE[slot], ...(slot === 'root' ? extraRoot : []), classNames?.[slot]].filter(Boolean).join(' ');
}

/** Props every component accepts. Anything else (`id`, `style`, `data-*`, ...) lands on the root element. */
export type BaseProps = Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'children' | 'defaultValue'> & {
    /** Extra classes per part, added after the built-in `pc-*` class. */
    classNames?: ClassNames;
    /** Leave out the default styles for this component and bring your own. The `pc-*` classes stay. */
    unstyled?: boolean;
    /**
     * Set to `false` if you load `property-calculators/styles.css` yourself, for example under a
     * Content Security Policy that blocks inline styles. Defaults to `true`.
     */
    inlineStyles?: boolean;
    /** `light` (the default), `dark`, or `auto` to follow the visitor's system setting. */
    theme?: 'light' | 'dark' | 'auto';
};

/**
 * The default stylesheet. React 19 lifts it into the document head and keeps a single copy
 * however many components are on the page; React 18 renders it in place.
 *
 * The CSS is a text child, which React 18's server renderer HTML-escapes (`'` `"` `&` `<` `>`)
 * and browsers do not decode inside `<style>`. So `STYLES` is written without any of those five
 * characters, which makes the output the same bytes on both versions; a test holds it to that.
 */
export function Styles({ unstyled, inlineStyles = true }: { unstyled?: boolean; inlineStyles?: boolean }) {
    if (unstyled || !inlineStyles) return null;
    return (
        <style href="property-calculators" precedence="default">
            {STYLES}
        </style>
    );
}

/**
 * `true` for a plain PDF, or the brand to print it in: a name, a colour and a logo, plus the
 * button's `label`, the saved file's `filename`, and `onError` to hear why a PDF could not be made.
 */
export type PdfProp =
    | boolean
    | (PdfOptions & {
          label?: string;
          filename?: string;
          /** Called with the error when the PDF can't be fetched, built or saved. */
          onError?: (error: unknown) => void;
      });

/**
 * The "Download PDF" button. The PDF code is fetched on the first click, so a page that never
 * downloads one never loads it. A logo that fails to load or decode is left out instead of
 * blocking the file; any other failure is said in the status line next to the button and passed
 * to `pdf.onError`.
 */
export function PdfButton({
    pdf,
    filename,
    cx,
    make,
}: {
    pdf: PdfProp | undefined;
    filename: string;
    /** The class builder from `slots`: the button is `download`, its message `status`. */
    cx: (slot: Slot) => string;
    make: (api: PdfApi, options: PdfOptions) => Promise<Uint8Array>;
}) {
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    if (!pdf) return null;
    const { label = 'Download PDF', filename: name = filename, onError, ...options } = pdf === true ? {} : pdf;

    // `downloadPdfFile` never rejects, so neither does this.
    const download = async () => {
        setBusy(true);
        setMessage(null);
        setMessage(
            await downloadPdfFile({ load: () => import('../pdf/index'), make, options, filename: name, onError }),
        );
        setBusy(false);
    };

    return (
        <>
            <button type="button" className={cx('download')} disabled={busy} onClick={() => void download()}>
                {label}
            </button>
            <p className={cx('status')} role="status" data-state={message ? 'error' : undefined}>
                {message}
            </p>
        </>
    );
}
