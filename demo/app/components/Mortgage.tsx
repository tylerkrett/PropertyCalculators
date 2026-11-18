'use client';

import {
    BUYER_TYPES,
    type BuyerType,
    depositFromPercent,
    getMortgageSummary,
    MORTGAGE_DEFAULTS,
    MORTGAGE_LIMITS,
    parsePrice,
    REPAYMENT_TYPES,
    type RepaymentType,
} from 'property-calculators';
import { useState } from 'react';

export default function Mortgage() {
    const [priceText, setPriceText] = useState('500,000');
    const [depositText, setDepositText] = useState(() =>
        depositFromPercent(500_000, MORTGAGE_DEFAULTS.depositPercent).toLocaleString('en-GB'),
    );
    const [rate, setRate] = useState(String(MORTGAGE_DEFAULTS.rate));
    const [term, setTerm] = useState(String(MORTGAGE_DEFAULTS.term));
    const [type, setType] = useState<RepaymentType>(MORTGAGE_DEFAULTS.type);
    const [buyer, setBuyer] = useState<BuyerType>('home-mover');

    const { summary, error } = getMortgageSummary({
        price: parsePrice(priceText),
        deposit: depositText.trim() === '' ? Number.NaN : parsePrice(depositText),
        rate: rate.trim() === '' ? Number.NaN : Number(rate),
        termYears: Number(term),
        type,
        buyer,
    });

    return (
        <section>
            <h2>Mortgage</h2>

            <div className="form grid">
                <label>
                    <span>Property price</span>
                    <div className="money">
                        <input
                            inputMode="decimal"
                            value={priceText}
                            onChange={(event) => setPriceText(event.target.value)}
                        />
                    </div>
                </label>
                <label>
                    <span>Deposit</span>
                    <div className="money">
                        <input
                            inputMode="decimal"
                            value={depositText}
                            onChange={(event) => setDepositText(event.target.value)}
                        />
                    </div>
                </label>
                <label>
                    <span>Interest rate (%)</span>
                    <input
                        type="number"
                        step="0.05"
                        min={MORTGAGE_LIMITS.rate.min}
                        max={MORTGAGE_LIMITS.rate.max}
                        value={rate}
                        onChange={(event) => setRate(event.target.value)}
                    />
                </label>
                <label>
                    <span>Term (years)</span>
                    <input
                        type="number"
                        min={MORTGAGE_LIMITS.term.min}
                        max={MORTGAGE_LIMITS.term.max}
                        value={term}
                        onChange={(event) => setTerm(event.target.value)}
                    />
                </label>
                <label>
                    <span>Type</span>
                    <select value={type} onChange={(event) => setType(event.target.value as RepaymentType)}>
                        {REPAYMENT_TYPES.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label>
                    <span>Buyer (for stamp duty)</span>
                    <select value={buyer} onChange={(event) => setBuyer(event.target.value as BuyerType)}>
                        {BUYER_TYPES.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            {summary ? (
                <dl className="rows">
                    {summary.rows.map((row, index) => (
                        <div key={row.key} className={index === 0 ? 'lead' : undefined}>
                            <dt>{row.label}</dt>
                            <dd>{row.formatted}</dd>
                        </div>
                    ))}
                </dl>
            ) : (
                <p className="hint" role="status">
                    {error}
                </p>
            )}
        </section>
    );
}
