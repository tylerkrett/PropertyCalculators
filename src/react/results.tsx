import type { ReactNode } from 'react';

import type { Slot } from './shared';

/*
 * The results side the calculators share: the labelled rows, the headline boxes, the band table
 * and the notes. None of these is a live region: `Status` in ./fields announces the headline.
 */

type Cx = (slot: Slot) => string;
type Labelled = { key: string; label: string; formatted: string };

/** A summary's labelled rows as a definition list; the first row is the headline. */
export function ResultRows({ cx, rows }: { cx: Cx; rows: readonly Labelled[] }) {
    return (
        <dl className={cx('rows')}>
            {rows.map((row, index) => (
                <div key={row.key} className={cx('row')} data-key={row.key} data-lead={index === 0 || undefined}>
                    <dt>{row.label}</dt>
                    <dd>{row.formatted}</dd>
                </div>
            ))}
        </dl>
    );
}

/** The headline figures as a row of boxes: price, tax to pay, actual rate. */
export function SummaryItems({ cx, items }: { cx: Cx; items: readonly Labelled[] }) {
    return (
        <dl className={cx('summary')}>
            {items.map((item) => (
                <div key={item.key} className={cx('summaryItem')} data-key={item.key}>
                    <dt>{item.label}</dt>
                    <dd>{item.formatted}</dd>
                </div>
            ))}
        </dl>
    );
}

/** A column of `BandTable`; `key` indexes each row's cells. */
type Column<K extends string> = { key: K; label: string; align: 'left' | 'right' };

/** The band-by-band breakdown: a caption, one row per band and a totals row. */
export function BandTable<K extends string>({
    cx,
    caption,
    columns,
    rows,
    totals,
}: {
    cx: Cx;
    caption: ReactNode;
    columns: readonly Column<K>[];
    /** One per band: a stable `key` and the text of each column's cell. */
    rows: readonly ({ key: string | number } & Record<K, string>)[];
    /** The footer row, by column. */
    totals: Record<K, string>;
}) {
    return (
        <table className={cx('table')}>
            <caption className={cx('heading')}>{caption}</caption>
            <thead>
                <tr>
                    {columns.map((column) => (
                        <th key={column.key} scope="col" data-align={column.align}>
                            {column.label}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((row) => (
                    <tr key={row.key}>
                        {columns.map((column) => (
                            <td key={column.key} data-align={column.align}>
                                {row[column.key]}
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
            <tfoot>
                <tr>
                    {columns.map((column) => (
                        <td key={column.key} data-align={column.align}>
                            {totals[column.key]}
                        </td>
                    ))}
                </tr>
            </tfoot>
        </table>
    );
}

/** Plain-English notes under a result, one paragraph each; empty lines are skipped. */
export function Hints({ cx, lines }: { cx: Cx; lines: readonly (string | null | undefined)[] }) {
    return (
        <>
            {lines.filter(Boolean).map((line, index) => (
                // Notes have no identity beyond their position, and the same line may appear twice.
                <p key={index} className={cx('hint')}>
                    {line}
                </p>
            ))}
        </>
    );
}
