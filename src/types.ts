/** Raw patient record as returned by the API (fields may be missing or malformed). */
export interface RawPatient {
  patient_id?: string;
  name?: string;
  age?: number | string | null;
  gender?: string;
  blood_pressure?: string | null;
  temperature?: number | string | null;
  visit_date?: string;
  diagnosis?: string;
  medications?: string;
}

/** Pagination info from the API response. */
export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

/** Top-level API response for GET /api/patients. */
export interface PatientsResponse {
  data: RawPatient[];
  pagination: Pagination;
  metadata?: Record<string, unknown>;
}

/** Risk scores computed for a single patient. */
export interface RiskScores {
  bloodPressure: number;
  temperature: number;
  age: number;
  total: number;
}

/** Per-patient scoring result. */
export interface PatientResult {
  patientId: string;
  scores: RiskScores;
  hasDataQualityIssue: boolean;
  hasFever: boolean;
}

/** The three alert lists submitted to the API. */
export interface AlertLists {
  high_risk_patients: string[];
  fever_patients: string[];
  data_quality_issues: string[];
}

/** Submission response from POST /api/submit-assessment. */
export interface SubmissionResponse {
  success: boolean;
  message: string;
  results: {
    score: number;
    percentage: number;
    status: string;
    breakdown: Record<string, unknown>;
    feedback: Record<string, unknown>;
    attempt_number: number;
    remaining_attempts: number;
  };
}
