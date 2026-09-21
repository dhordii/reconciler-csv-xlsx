# Product

## Platform

web

## Stack

React, TypeScript, and Vite. The application is distributed as a static site and also has a documented local development and preview path.

## Users

The primary user is a non-technical operations, finance, or accounting specialist who regularly reconciles two structured files with stable schemas. They need a guided workflow that explains decisions in plain English and preserves enough source evidence to verify every exception.

## Product Purpose

Reconciler compares two CSV or XLSX files row by row using a user-selected single or composite key. It separates exact matches, differences, records found only on one side, duplicate keys, and rows with missing keys. Success means a user can configure a recurring reconciliation without code, review exceptions, and export a traceable XLSX report without altering either source file.

## Positioning

Reconciler makes every matching and comparison rule explicit before it runs. It preserves the original values, isolates ambiguous records instead of guessing, and records enough provenance to trace each reported result back to its source row.

## Operating Context

Users work with recurring CSV and XLSX extracts. A run follows a guided flow: upload two files, select worksheets and header rows, map columns, choose key columns, set comparison rules, review the configuration, run reconciliation, inspect results, and download a complete XLSX report. Profiles can be reused or transferred as JSON, but never contain source records or prior results.

## Capabilities and Constraints

- Local browser processing only. No backend, analytics, CDN, external fonts, or runtime API calls.
- English interface and report labels. Source column names remain unchanged.
- Current Chrome, Edge, Firefox, and Safari.
- Responsive operation from 360px, with searchable virtualized result cards and expandable full-record detail on every screen size.
- Light and dark themes, initially following the system preference.
- CSV input supports UTF-8 and Windows-1251, with detected or user-selected comma, semicolon, tab, or pipe delimiters.
- XLSX input supports selecting one worksheet per file and comparing cached formula results without recalculating formulas.
- Header rows are proposed automatically and can be corrected in a preview.
- Exact header matches are mapped automatically; other mappings are confirmed manually.
- Keys may contain one or more columns. Duplicate and incomplete keys are isolated rather than paired.
- Text comparison is strict by default, with per-column normalization controls.
- Date and number formats require confirmation when ambiguous.
- Numeric columns support absolute and relative tolerances, both zero by default.
- Blank values equal only blank values.
- Source files are never modified. MVP does not merge or correct data.
- Results support search by key, category and changed-column filters, sorting, and virtualized rendering.
- The XLSX report always contains the complete run, regardless of active UI filters. Exact matches are optional and excluded by default.
- Each reported record identifies its source file, worksheet, and original row number.
- Target limit per source is 50 MB, 100,000 rows, or 2 million cells, whichever is reached first.
- Reconciliation targets 30 seconds on a documented modern-laptop benchmark, keeps the interface responsive, reports progress, and supports cancellation.
- GitHub Pages is the intended static host. Publishing remains an explicitly gated external action.

## Brand Commitments

- Product name: Reconciler.
- Voice: calm, direct, specific, and non-technical.
- The interface must not resemble a dense legacy accounting system.
- Technical terms and hidden rules are unacceptable; each important decision explains what will be compared and why.
- The product has its own visual system rather than imitating an existing application.
- The quality bar combines Linear's operational precision, Stripe Dashboard's information hierarchy, and Notion's visual calm. These are standards to interpret, not brands or layouts to copy.
- Color is restrained at page scale: cool neutrals establish trust and one indigo accent identifies primary actions, focus, and selected state.
- The interface uses a local system font stack for dense data and a bundled local Oxygen wordmark; no external font request is allowed.

## Evidence on Hand

No real customer files, logo, testimonials, or performance measurements were supplied. Development and verification use clearly labelled synthetic CSV and XLSX fixtures covering exact matches, differences, duplicates, missing keys, schema drift, ambiguous dates and numbers, formulas, encodings, and formula-like text.

## Product Principles

1. Never guess when a match or conversion is ambiguous.
2. Keep source data local, unchanged, and traceable.
3. Reveal complexity only when the current decision requires it.
4. Make recurring work faster without hiding profile or schema changes.
5. Treat export correctness and inspectability as part of the product, not an afterthought.

## Accessibility & Inclusion

WCAG 2.2 AA is an acceptance criterion. The complete workflow supports keyboard navigation, visible focus, screen-reader labels and status announcements, sufficient contrast, reduced motion, and touch targets appropriate for mobile use.
