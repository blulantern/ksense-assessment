import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchAllPatients, submitAssessment } from "../src/client.js";
import type { AlertLists, PatientsResponse } from "../src/types.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeResponse(page: number, totalPages: number, ids: string[]): PatientsResponse {
  return {
    data: ids.map((id) => ({
      patient_id: id,
      blood_pressure: "120/80",
      temperature: 98.6,
      age: 45,
    })),
    pagination: {
      page,
      limit: 5,
      total: totalPages * 5,
      totalPages,
      hasNext: page < totalPages,
      hasPrevious: page > 1,
    },
  };
}

function okResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body, headers: new Headers() };
}

function errResponse(status: number) {
  return { ok: false, status, json: async () => ({}), headers: new Headers() };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("fetchAllPatients", () => {
  it("paginates through all pages", async () => {
    mockFetch
      .mockResolvedValueOnce(okResponse(makeResponse(1, 2, ["P1", "P2"])))
      .mockResolvedValueOnce(okResponse(makeResponse(2, 2, ["P3", "P4"])));

    const patients = await fetchAllPatients("test-key");
    expect(patients).toHaveLength(4);
    expect(patients.map((p) => p.patient_id)).toEqual(["P1", "P2", "P3", "P4"]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries on 429 and 5xx errors", async () => {
    mockFetch
      .mockResolvedValueOnce(errResponse(429))
      .mockResolvedValueOnce(errResponse(503))
      .mockResolvedValueOnce(okResponse(makeResponse(1, 1, ["P1"])));

    const patients = await fetchAllPatients("test-key", { maxRetries: 5, retryDelayMs: 0 });
    expect(patients).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("retries on network-level errors (fetch rejects)", async () => {
    mockFetch
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(okResponse(makeResponse(1, 1, ["P1"])));

    const patients = await fetchAllPatients("test-key", { maxRetries: 5, retryDelayMs: 0 });
    expect(patients).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it("throws immediately on non-retryable 4xx (e.g. 401)", async () => {
    mockFetch.mockResolvedValueOnce(errResponse(401));

    await expect(fetchAllPatients("test-key", { maxRetries: 3, retryDelayMs: 0 }))
      .rejects.toThrow("401");
    // Should not retry — only one call made.
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("throws after max retries exhausted", async () => {
    mockFetch.mockResolvedValue(errResponse(500));

    await expect(fetchAllPatients("test-key", { maxRetries: 2, retryDelayMs: 0 }))
      .rejects.toThrow();
  });

  it("throws when the response body has an unexpected shape", async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ unexpected: true }));

    await expect(fetchAllPatients("test-key", { maxRetries: 0 }))
      .rejects.toThrow("Unexpected response shape");
  });
});

describe("submitAssessment", () => {
  const alerts: AlertLists = {
    high_risk_patients: ["P001"],
    fever_patients: ["P002"],
    data_quality_issues: ["P003"],
  };

  it("posts the alert lists and returns the response", async () => {
    const mockResult = {
      success: true,
      message: "OK",
      results: {
        score: 90,
        percentage: 90,
        status: "pass",
        breakdown: {},
        feedback: {},
        attempt_number: 1,
        remaining_attempts: 2,
      },
    };
    mockFetch.mockResolvedValueOnce(okResponse(mockResult));

    const result = await submitAssessment("test-key", alerts);
    expect(result.success).toBe(true);
    expect(result.results.score).toBe(90);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("submit-assessment");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(alerts);
  });

  it("retries on 5xx errors before succeeding", async () => {
    const mockResult = {
      success: true,
      message: "OK",
      results: {
        score: 80,
        percentage: 80,
        status: "pass",
        breakdown: {},
        feedback: {},
        attempt_number: 1,
        remaining_attempts: 2,
      },
    };
    mockFetch
      .mockResolvedValueOnce(errResponse(503))
      .mockResolvedValueOnce(okResponse(mockResult));

    const result = await submitAssessment("test-key", alerts, { maxRetries: 3, retryDelayMs: 0 });
    expect(result.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("throws on non-retryable 4xx", async () => {
    mockFetch.mockResolvedValueOnce(errResponse(403));

    await expect(submitAssessment("test-key", alerts, { maxRetries: 3, retryDelayMs: 0 }))
      .rejects.toThrow("403");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
