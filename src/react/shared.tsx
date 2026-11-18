import { type HTMLAttributes, useState } from 'react';

import type { PdfOptions } from '../pdf/index';

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
 * button's `label` and the saved file's `filename`.
 */
export type PdfProp = boolean | (PdfOptions & { label?: string; filename?: string });

type PdfApi = typeof import('../pdf/index');

/**
 * The "Download PDF" button. The PDF code is fetched on the first click, so a page that never
 * downloads one never loads it. A logo that fails to load is left out instead of blocking the file.
 */
export function PdfButton({
    pdf,
    filename,
    className,
    make,
}: {
    pdf: PdfProp | undefined;
    filename: string;
    className: string;
    make: (api: PdfApi, options: PdfOptions) => Promise<Uint8Array>;
}) {
    const [busy, setBusy] = useState(false);
    if (!pdf) return null;
    const { label = 'Download PDF', filename: name = filename, ...options } = pdf === true ? {} : pdf;

    const download = async () => {
        setBusy(true);
        try {
            const api = await import('../pdf/index');
            const bytes = await make(api, options).catch(() => make(api, { ...options, logo: undefined }));
            api.downloadPdf(bytes, name);
        } finally {
            setBusy(false);
        }
    };

    return (
        <button type="button" className={className} disabled={busy} onClick={() => void download()}>
            {label}
        </button>
    );
}
