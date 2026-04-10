import type { RawPatient, PatientsResponse, AlertLists, SubmissionResponse } from "./types.js";

const BASE_URL = "https://assessment.ksensetech.com/api";

export interface RetryOptions {
  maxRetries?: number;
  retryDelayMs?: number;
}

/**
 * Fetch a URL with retry logic for 429/5xx errors and network failures.
 * Respects the Retry-After header when present; otherwise uses exponential backoff.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit = {},
  opts: RetryOptions = {},
): Promise<Response> {
  const { maxRetries = 5, retryDelayMs = 1000 } = opts;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let resp: Response;
    try {
      resp = await fetch(url, init);
    } catch (networkErr) {
      // Network-level failures (DNS, connection reset, etc.) are retryable.
      lastError = networkErr instanceof Error ? networkErr : new Error(String(networkErr));
      if (attempt < maxRetries) {
        const delay = retryDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw lastError;
    }

    if (resp.ok) return resp;

    if (resp.status === 429 || resp.status >= 500) {
      lastError = new Error(`HTTP ${resp.status} on attempt ${attempt + 1}`);
      if (attempt < maxRetries) {
        // Honor the server's requested wait time when provided.
        const retryAfter = resp.headers.get("Retry-After");
        const delay = retryAfter
          ? parseFloat(retryAfter) * 1000
          : retryDelayMs * Math.pow(2, attempt);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    } else {
      throw new Error(`HTTP ${resp.status}: non-retryable error`);
    }
  }

  throw lastError ?? new Error("Max retries exhausted");
}

/**
 * Fetch all patients across all pages.
 */
export async function fetchAllPatients(
  apiKey: string,
  retryOpts: RetryOptions = {},
): Promise<RawPatient[]> {
  const allPatients: RawPatient[] = [];
  let page = 1;
  const limit = 20;

  while (true) {
    const url = `${BASE_URL}/patients?page=${page}&limit=${limit}`;
    const resp = await fetchWithRetry(
      url,
      { headers: { "x-api-key": apiKey } },
      retryOpts,
    );

    // Defensively validate the response shape before trusting it.
    const body = await resp.json() as unknown;
    if (!isPatientsResponse(body)) {
      throw new Error(`Unexpected response shape on page ${page}: ${JSON.stringify(body)}`);
    }

    allPatients.push(...body.data);

    if (!body.pagination.hasNext) break;
    page++;
  }

  return allPatients;
}

/**
 * Submit alert lists to the assessment API.
 * Retries on transient failures so a network hiccup doesn't discard computed results.
 */
export async function submitAssessment(
  apiKey: string,
  alerts: AlertLists,
  retryOpts: RetryOptions = {},
): Promise<SubmissionResponse> {
  const resp = await fetchWithRetry(
    `${BASE_URL}/submit-assessment`,
    {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(alerts),
    },
    retryOpts,
  );

  return resp.json() as Promise<SubmissionResponse>;
}

// ---------------------------------------------------------------------------
// Runtime type guards
// ---------------------------------------------------------------------------

function isPatientsResponse(value: unknown): value is PatientsResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v["data"]) &&
    typeof v["pagination"] === "object" &&
    v["pagination"] !== null &&
    typeof (v["pagination"] as Record<string, unknown>)["hasNext"] === "boolean"
  );
}
