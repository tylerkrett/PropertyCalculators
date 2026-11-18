import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { createCalculator, operation } from '../src/calculator/index';
import { DeskCalculator, MortgageCalculator, StampDutyCalculator, STYLES } from '../src/react/index';

const html = renderToStaticMarkup;

describe('StampDutyCalculator', () => {
    it('renders a finished result from its defaults', () => {
        const markup = html(<StampDutyCalculator defaultPrice={750_000} />);
        expect(markup).toContain('value="750,000"');
        expect(markup).toContain('£27,500');
        expect(markup).toContain('3.67%');
        expect(markup).toContain('£250,001 – £925,000');
        expect(markup).toContain('How this result was calculated');
    });

    it('honours buyer type, residency and the breakdown switch', () => {
        const markup = html(
            <StampDutyCalculator defaultPrice={750_000} defaultBuyer="additional-property" defaultNonUkResident showBreakdown={false} />,
        );
        expect(markup).toContain('£80,000');
        expect(markup).not.toContain('<table');
    });

    it('asks for a price when there is none', () => {
        expect(html(<StampDutyCalculator />)).toContain('Enter a price to see the stamp duty.');
    });

    it('labels every control', () => {
        const markup = html(<StampDutyCalculator />);
        const id = /<label class="pc-label" for="([^"]+)"/.exec(markup)?.[1];
        expect(id).toBeTruthy();
        expect(markup).toContain(`<input id="${id}"`);
        expect(markup).toContain('<legend class="pc-label">Buyer</legend>');
    });
});

describe('MortgageCalculator', () => {
    it('renders the summary rows', () => {
        const markup = html(<MortgageCalculator defaultPrice={500_000} defaultDeposit={100_000} defaultRate={5} />);
        expect(markup).toContain('£2,338.36');
        expect(markup).toContain('Cash needed upfront');
        expect(markup).toContain('£115,000');
    });

    it('defaults the deposit to a quarter of the price', () => {
        expect(html(<MortgageCalculator defaultPrice={400_000} />)).toContain('value="100,000"');
    });

    it('shows the form error instead of results', () => {
        const markup = html(<MortgageCalculator defaultPrice={500_000} defaultRate={40} />);
        expect(markup).toContain('Enter an interest rate between 0% and 25%.');
        expect(markup).not.toContain('class="pc-rows"');
    });
});

describe('DeskCalculator', () => {
    it('renders every key, with currency keys off until rates arrive', () => {
        const markup = html(<DeskCalculator />);
        expect(markup.match(/class="pc-key"/g)).toHaveLength(30);
        expect(markup.match(/disabled=""/g)).toHaveLength(4);
        expect(markup).toContain('aria-label="Square feet to square metres"');
        expect(markup).toContain('>0</output>');
    });

    it('can drop the conversion keys', () => {
        expect(html(<DeskCalculator conversions={false} />).match(/class="pc-key"/g)).toHaveLength(20);
    });

    it('shows an outside store', () => {
        const calculator = createCalculator();
        for (const input of [1, 2, operation.vatPlus]) calculator.input(input);
        expect(html(<DeskCalculator calculator={calculator} />)).toContain('>14.4</output>');
    });
});

describe('styling', () => {
    it('ships its styles by default and drops them when unstyled', () => {
        expect(html(<StampDutyCalculator />)).toContain('--pc-accent');
        const bare = html(<StampDutyCalculator unstyled />);
        expect(bare).not.toContain('<style');
        expect(bare).toContain('class="pc pc-stamp-duty"');
        expect(html(<StampDutyCalculator />)).toContain('class="pc pc-styled pc-stamp-duty"');
    });

    it('can leave the stylesheet to the page while staying styled', () => {
        const markup = html(<DeskCalculator inlineStyles={false} />);
        expect(markup).not.toContain('<style');
        expect(markup).toContain('class="pc pc-styled pc-calculator"');
    });

    it('scopes every rule to styled components without adding specificity', () => {
        const preludes = [...STYLES.matchAll(/^\s*([.:][^{@]*)\{/gm)].map((match) => match[1]!);
        expect(preludes.length).toBeGreaterThan(40);
        for (const prelude of preludes)
            for (const selector of prelude.split(',')) expect(selector, selector).toContain(':where(.pc-styled)');
    });

    it('adds caller classes after the built-in ones and passes other props to the root', () => {
        const markup = html(
            <MortgageCalculator unstyled className="card" classNames={{ root: 'p-4', input: 'rounded-none', row: 'py-1' }} id="m" theme="dark" defaultPrice={500_000} />,
        );
        expect(markup).toContain('<div id="m" data-theme="dark" class="pc pc-mortgage card p-4">');
        expect(markup).toContain('class="pc-input rounded-none"');
        expect(markup).toContain('class="pc-row py-1"');
    });

    it('has a rule for every class the components use', () => {
        const markup = [<StampDutyCalculator key="s" defaultPrice={1} />, <MortgageCalculator key="m" defaultPrice={500_000} />, <DeskCalculator key="d" />]
            .map((element) => html(element))
            .join('');
        const used = new Set([...markup.matchAll(/class="([^"]+)"/g)].flatMap((match) => match[1]!.split(' ')));
        const layoutOnly = new Set(['pc-stamp-duty', 'pc-mortgage', 'pc-styled']);
        for (const name of used) if (!layoutOnly.has(name)) expect(STYLES, name).toContain(`.${name}`);
    });
});
