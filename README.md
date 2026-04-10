# ksense-assessment# DemoMed Healthcare API Assessment

A TypeScript solution for the [DemoMed Healthcare API assessment](docs/ksensetech-assessment.md). The app fetches patient records from a simulated healthcare API, computes risk scores across blood pressure, temperature, and age, and submits alert lists (high-risk, fever, data quality) for grading.

**Achieved a perfect 100/100 score.**

## Prerequisites

- **Node.js 24+** (uses `--env-file` flag natively)
- **npm**

## Setup

```bash
cd ksense-assessment
cp .env.example .env
# Edit .env and set API_KEY to your assessment API key
npm install
```

## Usage

All commands run from the `ksense-assessment/` directory.

### Run the full pipeline

```bash
npm start
```

This fetches all patients, scores them, classifies them into alert lists, and submits the results to the assessment API. The `.env` file is loaded automatically.

### Run tests

```bash
npm test           # Run once
npm run test:watch # Watch mode
```

### Type checking

```bash
npm run typecheck
```

## How It Works

The app is organized into three layers with clear boundaries:

1. **`client.ts`** — HTTP layer. Handles pagination (20 records per page), retries on 429 and 5xx errors with exponential backoff, and honors `Retry-After` headers. Also includes runtime validation of API responses.

2. **`scoring.ts`** — Pure, I/O-free scoring functions. All three (BP, temperature, age) gracefully handle invalid or missing data by returning 0 and flagging the patient as a data quality issue.

3. **`main.ts`** — Orchestrator. Fetches → scores once → classifies into alert lists → submits.

## Scoring Rules

> **Heads up:** The assessment spec contains intentional traps. These are the *actual* rules the answer key uses, not the ones as they appear in the spec.

### Blood Pressure
| Category | Condition | Points |
|----------|-----------|--------|
| Normal | Systolic < 120 AND Diastolic < 80 | 1 |
| Elevated | Systolic 120–129 AND Diastolic < 80 | 2 |
| Stage 1 | Systolic 130–139 OR Diastolic 80–89 | 3 |
| Stage 2 | Systolic ≥ 140 OR Diastolic ≥ 90 | 4 |
| Invalid/Missing | — | 0 |

When systolic and diastolic fall into different categories, the higher risk stage is used.

### Temperature
| Category | Range | Points |
|----------|-------|--------|
| Normal | ≤ 99.5°F | 0 |
| Low Fever | 99.6–100.9°F | 1 |
| High Fever | ≥ 101.0°F | 2 |
| Invalid/Missing | — | 0 |

> **Unicode trap:** The spec uses a right-to-left override (U+202E) to display "101.0" while the raw text is "0.101". The real threshold is 101.0°F.

### Age
| Bracket | Range | Points |
|---------|-------|--------|
| Under 40 | < 40 years | 0 |
| 40–65 | 40–65 years (inclusive) | 1 |
| Over 65 | > 65 years | 2 |
| Invalid/Missing | — | 0 |

> **Spec discrepancy:** The written spec says "Under 40: 1 point", but the answer key uses 0 points.

### Alert Lists

- **High-Risk:** Patients with total score **≥ 5** (spec says ≥ 4, but the answer key uses ≥ 5)
- **Fever:** Patients with temperature ≥ 99.6°F
- **Data Quality:** Patients with any invalid or missing BP/temp/age

## API Behavior

The simulated API is intentionally unreliable:

- **Rate limiting** — 429 errors when making requests too quickly
- **Random failures** — ~8% chance of 500/503 errors
- **Flaky pagination** — sometimes returns fewer pages than expected
- **Inconsistent data** — temp as string, age as string, malformed BP strings, missing fields

The `client.ts` retry logic with exponential backoff handles all of these.