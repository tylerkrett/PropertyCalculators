/*
 * Tenant affordability: the referencing income check, both ways. `calculateTenantAffordability`
 * and `getTenantAffordabilitySummary` go from a rent to the income needed (and, given an income,
 * whether it passes); `maxRentForIncome` goes from an income to the most rent it supports.
 */
export * from './calculate';
export * from './summary';
