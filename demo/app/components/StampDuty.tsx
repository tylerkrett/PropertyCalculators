'use client';

import {
    BUYER_TYPES,
    type BuyerType,
    calculateStampDuty,
    getStampDutyTable,
    parsePrice,
    STAMP_DUTY_LABELS,
} from 'property-calculators';
import { useState } from 'react';

export default function StampDuty() {
    const [priceText, setPriceText] = useState('750,000');
    const [buyer, setBuyer] = useState<BuyerType>('home-mover');
    const [nonUkResident, setNonUkResident] = useState(false);

    const price = parsePrice(priceText);
    const table =
        Number.isFinite(price) && price > 0
            ? getStampDutyTable(calculateStampDuty({ price, buyer, nonUkResident }))
            : null;

    return (
        <section>
            <h2>Stamp duty</h2>

            <div className="form">
                <label>
                    <span>{STAMP_DUTY_LABELS.price}</span>
                    <div className="money">
                        <input
                            inputMode="decimal"
                            value={priceText}
                            onChange={(event) => setPriceText(event.target.value)}
                        />
                    </div>
                </label>

                <fieldset>
                    <legend>Buyer</legend>
                    <div className="segmented">
                        {BUYER_TYPES.map((option) => (
                            <label key={option.value}>
                                <input
                                    type="radio"
                                    name="buyer"
                                    checked={buyer === option.value}
                                    onChange={() => setBuyer(option.value)}
                                />
                                <span>{option.label}</span>
                            </label>
                        ))}
                    </div>
                </fieldset>

                <label className="check">
                    <input
                        type="checkbox"
                        checked={nonUkResident}
                        onChange={(event) => setNonUkResident(event.target.checked)}
                    />
                    <span>{STAMP_DUTY_LABELS.nonUkResident}</span>
                </label>
            </div>

            {table ? (
                <>
                    <dl className="summary">
                        {table.summary.map((item) => (
                            <div key={item.key}>
                                <dt>{item.label}</dt>
                                <dd>{item.formatted}</dd>
                            </div>
                        ))}
                    </dl>

                    <h3>{STAMP_DUTY_LABELS.breakdown}</h3>
                    <div className="scroll">
                        <table>
                            <thead>
                                <tr>
                                    {table.columns.map((column) => (
                                        <th key={column.key} className={column.align}>
                                            {column.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {table.rows.map((row) => (
                                    <tr key={row.key}>
                                        {table.columns.map((column) => (
                                            <td key={column.key} className={column.align}>
                                                {row[column.key]}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr>
                                    {table.columns.map((column) => (
                                        <td key={column.key} className={column.align}>
                                            {table.totals[column.key]}
                                        </td>
                                    ))}
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </>
            ) : (
                <p className="hint">Enter a price to see the stamp duty.</p>
            )}
        </section>
    );
}
