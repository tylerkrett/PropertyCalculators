import { clampLines, wrapText } from './text';
import { createPage, PAGE, type Page, type Rgb, type TextStyle } from './writer';

/*
 * Content flowing down A4 pages. The layout moves a cursor (`y`) down the page as it draws and
 * asks for room before each piece; when there is none, a new page starts. Every page ends with
 * the brand's footer, and with "Page 1 of 2" when there is more than one.
 */

export const INK: Rgb = [0.11, 0.14, 0.19];
export const MUTED: Rgb = [0.4, 0.43, 0.48];
export const LINE: Rgb = [0.86, 0.87, 0.89];

const FOOTER = { size: 8.5, lead: 11, maxLines: 3 };
/** Space kept beside the footer for the page number. */
const NUMBER_WIDTH = 72;

export interface Flow {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    /** The page being drawn on. */
    page: Page;
    /** The cursor: by convention the baseline of the next line to draw. */
    y: number;
    /**
     * Makes sure a line at `y` and `room` points below it clear the footer, starting a new page
     * (with `y` on its first baseline) when they do not. Returns whether a page was started.
     */
    fit(room?: number): boolean;
    /** Draws lines down from `y` at `x`, `lead` apart, moving on a page as needed. Leaves `y` on the last. */
    block(lines: string[], x: number, lead: number, style: TextStyle): void;
    /** Draws lines down from `y` at `x` without moving `y` or changing page: one cell of a row. */
    column(lines: string[], x: number, lead: number, style: TextStyle): void;
    /** Adds the footer to every page and returns each page's instructions. */
    finish(): string[][];
}

/**
 * Starts a document. `numbered` reserves room for, and prints, page numbers: lay out without it
 * first, and again with it if that gave more than one page.
 */
export function createFlow({ footer, colour, numbered }: { footer?: string; colour: Rgb; numbered: boolean }): Flow {
    const left = PAGE.margin;
    const right = PAGE.width - PAGE.margin;
    const top = PAGE.height - PAGE.margin;
    const footerWidth = right - left - (numbered ? NUMBER_WIDTH : 0);
    const footerLines = clampLines(footer ? wrapText(footer, FOOTER.size, footerWidth) : [], FOOTER.maxLines);
    const footed = numbered || footerLines.length > 0;
    // The footer's last line sits on the margin; a rule above it closes the content area.
    const rule = PAGE.margin + 14 + Math.max(0, footerLines.length - 1) * FOOTER.lead;
    const bottom = footed ? rule + 12 : PAGE.margin;
    const pages: Page[] = [createPage()];

    const flow: Flow = {
        left,
        right,
        top,
        page: pages[0]!,
        y: top,
        fit(room = 0) {
            // An empty page is as much room as there will ever be, so never leave one blank.
            if (flow.y - room >= bottom || !flow.page.ops.length) return false;
            flow.page = createPage();
            pages.push(flow.page);
            flow.y = top - 12;
            return true;
        },
        block(lines, x, lead, style) {
            lines.forEach((line, index) => {
                if (index) flow.y -= lead;
                flow.fit();
                flow.page.text(line, x, flow.y, style);
            });
        },
        column(lines, x, lead, style) {
            lines.forEach((line, index) => flow.page.text(line, x, flow.y - index * lead, style));
        },
        finish() {
            pages.forEach((page, index) => {
                if (footed) page.line(left, right, rule, LINE);
                footerLines.forEach((line, row) =>
                    page.text(line, left, PAGE.margin + (footerLines.length - 1 - row) * FOOTER.lead, {
                        size: FOOTER.size,
                        colour,
                    }),
                );
                if (numbered)
                    page.text(`Page ${index + 1} of ${pages.length}`, right, PAGE.margin, {
                        size: FOOTER.size,
                        colour: MUTED,
                        align: 'right',
                    });
            });
            return pages.map((page) => page.ops);
        },
    };
    return flow;
}
