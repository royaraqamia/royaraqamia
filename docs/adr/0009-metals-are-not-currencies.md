# Metals are not currencies

Gold and silver have ISO 4217 codes (XAU, XAG) and a provider can return them alongside fiat,
so the obvious path was to treat them as two more entries in the currency list. We decided
against it: **Metal** is a distinct concept from **Currency**. A **Currency** is issued by a
country and quoted by code; a **Metal** is a commodity, priced in USD per troy ounce and bought
in grams and karats — units a currency picker has no business knowing about. Keeping them apart
keeps the currency selector a selector, keeps metal units out of `formatMoney`, and lets
**Metal Price** carry its own shape.

## Considered options

- **Metals as pseudo-currencies (XAU/XAG).** Rejected: it would push troy ounces, grams and
  karats into the currency formatter and the Expense currency picker, which have no use for
  them.
- **A metals-only module with its own currency list.** Rejected: currencies are genuinely
  shared; only metals are not.

## Consequences

Conversion across fiat and metals is a cross-operation, not currency arithmetic: the converter
must bridge a Currency to a Metal through their shared USD base. `CONTEXT.md` fixes **Currency**
and **Metal** as separate terms so code does not drift back to "currency" for gold.
