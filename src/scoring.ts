import type { RawPatient, PatientResult, AlertLists } from "./types.js";

/**
 * Parse blood pressure string "systolic/diastolic" into numbers.
 * Returns null if the format is invalid or values are non-numeric.
 */
function parseBP(bp: string | null | undefined): { systolic: number; diastolic: number } | null {
  if (bp == null || typeof bp !== "string") return null;
  const parts = bp.split("/");
  if (parts.length !== 2) return null;
  // Trim before numeric conversion so whitespace-padded strings are handled
  // consistently and so the empty-string guard is reliable.
  const rawSystolic = parts[0].trim();
  const rawDiastolic = parts[1].trim();
  if (rawSystolic === "" || rawDiastolic === "") return null;
  const systolic = Number(rawSystolic);
  const diastolic = Number(rawDiastolic);
  if (!Number.isFinite(systolic) || !Number.isFinite(diastolic)) return null;
  return { systolic, diastolic };
}

/**
 * Score blood pressure risk.
 * If systolic and diastolic fall into different categories, use the higher risk stage.
 * Returns 0 for invalid/missing data.
 */
export function scoreBP(bp: string | null | undefined): number {
  const parsed = parseBP(bp);
  if (parsed === null) return 0;

  const { systolic, diastolic } = parsed;

  function stageFromSystolic(s: number): number {
    if (s >= 140) return 4;
    if (s >= 130) return 3;
    if (s >= 120) return 2;
    return 1;
  }

  function stageFromDiastolic(d: number): number {
    if (d >= 90) return 4;
    if (d >= 80) return 3;
    return 1;
  }

  const sStage = stageFromSystolic(systolic);
  const dStage = stageFromDiastolic(diastolic);

  return Math.max(sStage, dStage);
}

/**
 * Score temperature risk.
 * Normal (<=99.5): 0, Low fever (99.6-100.9): 1, High fever (>=101.0): 2.
 * Returns 0 for invalid/missing data.
 */
export function scoreTemp(temp: number | string | null | undefined): number {
  if (temp == null) return 0;
  const val = Number(temp);
  if (!Number.isFinite(val)) return 0;

  if (val >= 101.0) return 2;
  if (val >= 99.6) return 1;
  return 0;
}

/**
 * Score age risk.
 * Under 40: 0, 40-65 inclusive: 1, Over 65: 2.
 * Returns 0 for invalid/missing data.
 */
export function scoreAge(age: number | string | null | undefined): number {
  if (age == null) return 0;
  const val = Number(age);
  if (!Number.isFinite(val)) return 0;

  if (val > 65) return 2;
  if (val >= 40) return 1;
  return 0;
}

/**
 * Determine if a raw value represents invalid/missing data for a numeric field.
 */
function isInvalidNumeric(val: unknown): boolean {
  if (val == null) return true;
  const n = Number(val);
  return !Number.isFinite(n);
}

/**
 * Determine if a blood pressure string is invalid/missing.
 */
function isInvalidBP(bp: unknown): boolean {
  if (bp == null || typeof bp !== "string") return true;
  const parts = bp.split("/");
  if (parts.length !== 2) return true;
  if (parts[0].trim() === "" || parts[1].trim() === "") return true;
  return !Number.isFinite(Number(parts[0])) || !Number.isFinite(Number(parts[1]));
}

/**
 * Score a single patient and determine flags.
 */
export function scorePatient(patient: RawPatient): PatientResult {
  const bpScore = scoreBP(patient.blood_pressure);
  const tempScore = scoreTemp(patient.temperature);
  const ageScore = scoreAge(patient.age);

  const hasDataQualityIssue =
    isInvalidBP(patient.blood_pressure) ||
    isInvalidNumeric(patient.temperature) ||
    isInvalidNumeric(patient.age);

  // Re-use tempScore to avoid parsing temperature a second time.
  const hasFever = tempScore > 0;

  return {
    patientId: patient.patient_id ?? "UNKNOWN",
    scores: {
      bloodPressure: bpScore,
      temperature: tempScore,
      age: ageScore,
      total: bpScore + tempScore + ageScore,
    },
    hasDataQualityIssue,
    hasFever,
  };
}

/**
 * Classify pre-scored patient results into alert lists.
 * Accepts PatientResult[] so callers that already hold scored results don't
 * need to re-score every patient.
 */
export function classifyPatients(results: PatientResult[]): AlertLists {
  const highRisk: string[] = [];
  const fever: string[] = [];
  const dataQuality: string[] = [];

  for (const result of results) {
    if (result.scores.total >= 5) highRisk.push(result.patientId);
    if (result.hasFever) fever.push(result.patientId);
    if (result.hasDataQualityIssue) dataQuality.push(result.patientId);
  }

  return {
    high_risk_patients: highRisk,
    fever_patients: fever,
    data_quality_issues: dataQuality,
  };
}
