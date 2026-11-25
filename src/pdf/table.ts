import { type Flow, INK, LINE, MUTED } from './pages';
import { textWidth, wrapText } from './text';
import type { Rgb } from './writer';

/*
 * A table of working: a title, a header row, ruled rows and an optional totals row. Cells wrap
 * inside their column, and a table that runs past the foot of the page carries on over the next
 * with its header row repeated.
 */

export interface PdfTable {
    title: string;
    /** The first column is left-aligned; the rest are figures, right-aligned. */
    columns: string[];
    rows: string[][];
    totals?: string[];
    /** Rows to print in the muted colour, by index: bands the price never reaches. */
    muted?: number[];
}

interface RowStyle {
    size?: number;
    bold?: boolean;
    colour: Rgb;
}

/** Space left between a column's text and the next column. */
const GAP = 6;
/** The widest a figure column grows to before its cells wrap, and the least the first column keeps. */
const MAX_FIGURE = 160;
const MIN_FIRST = 100;

/**
 * How wide each column is. Figures share the right-hand side in equal steps, as long as they fit;
 * a column with a wider figure grows to hold it, and the first column takes what is left.
 */
function columnWidths(table: PdfTable, count: number, width: number): number[] {
    const step = Math.min(110, (width - 190) / Math.max(1, count - 1));
    const widest = (column: number) =>
        Math.max(
            textWidth(table.columns[column] ?? '', 9),
            ...table.rows.map((row) => textWidth(row[column] ?? '', 10)),
            textWidth(table.totals?.[column] ?? '', 10, true),
        );
    let figures = Array.from({ length: count - 1 }, (_, index) =>
        Math.max(step, Math.min(widest(index + 1) + GAP, MAX_FIGURE)),
    );
    const total = figures.reduce((sum, value) => sum + value, 0);
    if (total > width - MIN_FIRST) figures = figures.map((value) => (value * (width - MIN_FIRST)) / total);
    return [width - figures.reduce((sum, value) => sum + value, 0), ...figures];
}

/** Draws `table` at the flow's cursor, leaving the cursor under it. */
export function drawTable(flow: Flow, table: PdfTable): void {
    const { left, right } = flow;
    const count = Math.max(1, table.columns.length, ...table.rows.map((row) => row.length), table.totals?.length ?? 0);
    const widths = columnWidths(table, count, right - left);
    // Each figure column is right-aligned on its own right-hand edge; the last one ends at the margin.
    const edge = (column: number) => right - widths.slice(column + 1).reduce((sum, value) => sum + value, 0);

    /** Draws one row `gap` below the cursor and leaves the cursor `tail` under its last line. */
    const row = (values: string[], { size = 10, bold = false, colour }: RowStyle, gap: number, tail: number) => {
        const lead = size + 2;
        const cells = values
            .slice(0, count)
            .map((value, column) => wrapText(value, size, widths[column]! - (count > 1 ? GAP : 0), bold));
        const extra = (Math.max(1, ...cells.map((lines) => lines.length)) - 1) * lead;
        flow.y -= gap;
        // On a new page the header row comes first, then this row the usual distance under it.
        if (gap && flow.fit(extra + tail)) {
            header();
            flow.y -= gap;
        }
        cells.forEach((lines, column) =>
            column === 0
                ? flow.column(lines, left, lead, { size, bold, colour })
                : flow.column(lines, edge(column), lead, { size, bold, colour, align: 'right' }),
        );
        flow.y -= extra + tail;
    };
    const header = () => {
        row(table.columns, { size: 9, colour: MUTED }, 0, 8);
        flow.page.line(left, right, flow.y, LINE);
    };

    flow.y -= 22;
    // Keep the title with the header row and the first row.
    flow.fit(24 + 8 + 17 + 8);
    flow.block(wrapText(table.title, 12.5, right - left, true), left, 16, { size: 12.5, bold: true, colour: INK });
    flow.y -= 24;
    header();
    table.rows.forEach((values, index) => {
        row(values, { colour: table.muted?.includes(index) ? MUTED : INK }, 17, 8);
        flow.page.line(left, right, flow.y, LINE);
    });
    if (table.totals) row(table.totals, { bold: true, colour: INK }, 19, 10);
}
