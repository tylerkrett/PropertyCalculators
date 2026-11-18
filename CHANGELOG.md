# Changelog

## 1.3.0

- **Scotland and Wales:** `property-calculators/land-tax` adds LBTT (with first-time buyer relief
  and the Additional Dwelling Supplement) and LTT (main and higher rates), plus
  `calculatePropertyTax` to pick the right tax for any UK country.
- **Company stamp duty:** `calculateCompanyStampDuty` applies the flat 17% rate over £500,000, the
  reliefs from it, and the higher rates otherwise.
- **Affordability:** maximum loan and price from income multiples, and the income a price needs.
- **Overpayments and remortgaging:** time and interest saved by overpaying, and the break-even on
  switching deal.
- **Cost of buying:** deposit, stamp duty and fees as one upfront figure.
- **Buy-to-let check:** the interest cover ratio lenders use, the maximum loan and minimum rent.
- **Price per square foot:** price or rent per sq ft and per sq m, with a comparison helper.
- **Tenant deposit caps:** the Tenant Fees Act limits on tenancy deposits, holding deposits and
  rent in advance in England.
- **React and PDF:** a component and a PDF report for each of the calculators above.
- **Changed:** two to five dwellings bought together are charged the higher rates; six or more in
  Wales use non-residential rates; the refund claim deadline is one day earlier; remortgage
  results add `paymentSaving`, `balanceDifference` and `breakEvenWithinPeriod`.

## 1.2.0

- **Branded PDFs:** `property-calculators/pdf` prints any calculator's result as a one-page PDF
  with your name, colour, logo and footer: `stampDutyPdf`, `mortgagePdf`, `rentalYieldPdf`,
  `leaseStampDutyPdf`, and `createPdf` for a report of your own. Written by hand, so it adds no
  dependency. JPEG and PNG logos, transparency included.
- **Rental yield:** `getRentalYieldSummary` gives gross and net yield on a buy-to-let with stamp
  duty (additional-property rates by default), empty weeks and running costs counted.
  `getPortfolioYield` does the same across several properties.
- **React:** a new `RentalYieldCalculator`, and a `pdf` prop on the stamp duty, mortgage and
  rental yield components that adds a "Download PDF" button. The PDF code loads on first click.

## 1.1.0

- **New leases:** `calculateLeaseStampDuty` taxes the premium and the rent (through its net
  present value), with the lease rules for surcharges and first-time buyer relief applied.
  `calculateRentNpv` gives the rent figure alone.
- **Non-residential and mixed use:** `calculateStampDuty` takes `propertyType`, and `dwellings`
  for the six-or-more rule. Estimates now include `propertyType`.
- **Replacing a main residence:** `resolveBuyer` picks the buyer type from yes/no answers,
  `getHigherRatesRefund` gives the surcharge that can be claimed back, and `getRefundDeadlines`
  the dates.

## 1.0.0

First release.

- **Stamp duty (SDLT)** for England and Northern Ireland at the rates in force from 1 April 2025:
  home movers, first-time buyers, additional properties and non-UK residents.
- **Mortgage** payments, totals, loan to value and cash needed upfront.
- **Desk calculator** engine with VAT, rent, area and currency conversions.
- Every result comes with display strings, labels and table rows for building a UI.
- **React components** (`property-calculators/react`): `StampDutyCalculator`, `MortgageCalculator`
  and `DeskCalculator`, styled out of the box and themeable with CSS variables, per-part classes or
  your own stylesheet.
