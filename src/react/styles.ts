/** The default stylesheet, also published as `property-calculators/styles.css`. */
export const STYLES = `
.pc:where(.pc-styled) {
    --pc-accent: #1f5f5b;
    --pc-accent-ink: #ffffff;
    --pc-ink: #1c2330;
    --pc-muted: #5d6675;
    --pc-surface: #ffffff;
    --pc-soft: #eef3f2;
    --pc-line: #dedbd2;
    --pc-radius: 8px;
    --pc-gap: 16px;
    --pc-font: system-ui, -apple-system, 'Segoe UI', sans-serif;
    --pc-mono: ui-monospace, SFMono-Regular, Menlo, monospace;
    display: grid;
    gap: calc(var(--pc-gap) * 1.25);
    color: var(--pc-ink);
    font: 16px/1.5 var(--pc-font);
    text-align: left;
}
.pc:where(.pc-styled)[data-theme='dark'] {
    --pc-accent: #6fc3bb;
    --pc-accent-ink: #0d1a19;
    --pc-ink: #e8eaee;
    --pc-muted: #9aa3b2;
    --pc-surface: #1a2029;
    --pc-soft: #212a35;
    --pc-line: #2c3442;
}
@media (prefers-color-scheme: dark) {
    .pc:where(.pc-styled)[data-theme='auto'] {
        --pc-accent: #6fc3bb;
        --pc-accent-ink: #0d1a19;
        --pc-ink: #e8eaee;
        --pc-muted: #9aa3b2;
        --pc-surface: #1a2029;
        --pc-soft: #212a35;
        --pc-line: #2c3442;
    }
}
.pc:where(.pc-styled), .pc:where(.pc-styled) *, .pc:where(.pc-styled) *::before, .pc:where(.pc-styled) *::after { box-sizing: border-box; }
.pc:where(.pc-styled) :focus-visible { outline: 2px solid var(--pc-accent); outline-offset: 2px; }

:where(.pc-styled) .pc-form { display: grid; gap: var(--pc-gap); }
:where(.pc-styled) .pc-form[data-layout='grid'] { grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
:where(.pc-styled) .pc-field { display: block; min-width: 0; margin: 0; padding: 0; border: 0; }
:where(.pc-styled) .pc-label { display: block; margin: 0 0 6px; padding: 0; font-size: 14px; font-weight: 600; color: var(--pc-ink); }

:where(.pc-styled) .pc-input, :where(.pc-styled) .pc-select {
    display: block;
    width: 100%;
    height: 44px;
    margin: 0;
    padding: 0 12px;
    border: 1px solid var(--pc-line);
    border-radius: var(--pc-radius);
    background: var(--pc-surface);
    color: var(--pc-ink);
    font: inherit;
    font-variant-numeric: tabular-nums;
}
:where(.pc-styled) .pc-money { position: relative; }
:where(.pc-styled) .pc-prefix { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--pc-muted); pointer-events: none; }
:where(.pc-styled) .pc-money .pc-input { padding-left: 28px; }

:where(.pc-styled) .pc-options { display: flex; flex-wrap: wrap; gap: 8px; }
:where(.pc-styled) .pc-option { position: relative; display: block; }
:where(.pc-styled) .pc-option input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
:where(.pc-styled) .pc-option span {
    display: block;
    padding: 9px 14px;
    border: 1px solid var(--pc-line);
    border-radius: 999px;
    background: var(--pc-surface);
    font-weight: 500;
}
:where(.pc-styled) .pc-option[data-checked] span { background: var(--pc-accent); border-color: var(--pc-accent); color: var(--pc-accent-ink); }
:where(.pc-styled) .pc-option input:focus-visible + span { outline: 2px solid var(--pc-accent); outline-offset: 2px; }

:where(.pc-styled) .pc-check { display: flex; align-items: center; gap: 10px; }
:where(.pc-styled) .pc-check input { width: 18px; height: 18px; margin: 0; accent-color: var(--pc-accent); }

:where(.pc-styled) .pc-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin: 0; }
:where(.pc-styled) .pc-summary-item { padding: 14px 16px; border-radius: calc(var(--pc-radius) + 2px); background: var(--pc-soft); }
.pc:where(.pc-styled) dt { color: var(--pc-muted); font-size: 13px; }
.pc:where(.pc-styled) dd { margin: 0; font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; }

:where(.pc-styled) .pc-table { width: 100%; margin-top: calc(var(--pc-gap) * 1.25); border-collapse: collapse; font-size: 15px; font-variant-numeric: tabular-nums; }
:where(.pc-styled) .pc-heading { padding-bottom: 6px; text-align: left; font-size: 14px; font-weight: 600; color: var(--pc-muted); caption-side: top; }
:where(.pc-styled) .pc-table th, :where(.pc-styled) .pc-table td { padding: 10px 8px; border-bottom: 1px solid var(--pc-line); text-align: left; white-space: nowrap; }
:where(.pc-styled) .pc-table th { font-size: 13px; font-weight: 600; color: var(--pc-muted); }
:where(.pc-styled) .pc-table [data-align='right'] { text-align: right; }
:where(.pc-styled) .pc-table th:first-child, :where(.pc-styled) .pc-table td:first-child { padding-left: 0; }
:where(.pc-styled) .pc-table th:last-child, :where(.pc-styled) .pc-table td:last-child { padding-right: 0; }
:where(.pc-styled) .pc-table tfoot td { border-bottom: 0; font-weight: 600; }
@media (max-width: 480px) {
    :where(.pc-styled) .pc-table { font-size: 13px; }
    :where(.pc-styled) .pc-table th, :where(.pc-styled) .pc-table td { padding: 8px 4px; white-space: normal; }
}

:where(.pc-styled) .pc-rows { display: grid; margin: 0; }
:where(.pc-styled) .pc-row { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding: 10px 0; border-top: 1px solid var(--pc-line); }
:where(.pc-styled) .pc-row dt { font-size: 15px; }
:where(.pc-styled) .pc-row dd { font-size: 16px; }
:where(.pc-styled) .pc-row[data-lead] { padding-top: 0; border-top: 0; }
:where(.pc-styled) .pc-row[data-lead] dd { font-size: 28px; color: var(--pc-accent); }

:where(.pc-styled) .pc-hint { margin: 0; color: var(--pc-muted); font-size: 14px; }
:where(.pc-styled) .pc-download { justify-self: start; margin-top: var(--pc-gap); padding: 10px 16px; border: 1px solid var(--pc-accent); border-radius: var(--pc-radius); background: transparent; color: var(--pc-accent); font: 600 15px/1.2 var(--pc-font); cursor: pointer; }
:where(.pc-styled) .pc-download:hover:not(:disabled) { background: var(--pc-soft); }
:where(.pc-styled) .pc-download:disabled { opacity: 0.5; cursor: progress; }

:where(.pc-styled) .pc-calculator { gap: 12px; max-width: 560px; }
:where(.pc-styled) .pc-display {
    display: block;
    padding: 14px 16px;
    border-radius: calc(var(--pc-radius) + 2px);
    background: var(--pc-soft);
    text-align: right;
    font: 600 30px/1.2 var(--pc-mono);
    white-space: nowrap;
    overflow-x: auto;
}
:where(.pc-styled) .pc-pads { display: grid; gap: 12px; }
:where(.pc-styled) .pc-pads[data-conversions] { grid-template-columns: 2fr 3fr; }
:where(.pc-styled) .pc-pad { display: grid; grid-template-columns: repeat(var(--pc-columns, 4), minmax(0, 1fr)); gap: 6px; }
:where(.pc-styled) .pc-key {
    min-height: 46px;
    margin: 0;
    padding: 0 4px;
    border: 1px solid var(--pc-line);
    border-radius: var(--pc-radius);
    background: var(--pc-surface);
    color: var(--pc-ink);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
}
:where(.pc-styled) .pc-key:hover:not(:disabled) { border-color: var(--pc-accent); }
:where(.pc-styled) .pc-key:active:not(:disabled) { background: var(--pc-soft); }
:where(.pc-styled) .pc-key:disabled { opacity: 0.4; cursor: not-allowed; }
:where(.pc-styled) .pc-key[data-variant='operator'] { background: var(--pc-accent); border-color: var(--pc-accent); color: var(--pc-accent-ink); font-size: 18px; }
:where(.pc-styled) .pc-key[data-variant='clear'] { color: var(--pc-accent); font-weight: 700; }
:where(.pc-styled) .pc-key[data-variant='function'] { background: var(--pc-soft); font-size: 14px; }
@media (max-width: 520px) {
    :where(.pc-styled) .pc-pads[data-conversions] { grid-template-columns: 1fr; }
}
`;
