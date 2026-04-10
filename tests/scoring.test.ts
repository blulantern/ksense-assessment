import { describe, it, expect } from "vitest";
import { scoreBP, scoreTemp, scoreAge, scorePatient, classifyPatients } from "../src/scoring.js";
import type { RawPatient } from "../src/types.js";

describe("scoreBP", () => {
  it("returns 1 for normal BP (systolic <120 AND diastolic <80)", () => {
    expect(scoreBP("119/79")).toBe(1);
    expect(scoreBP("100/60")).toBe(1);
  });

  it("returns 2 for elevated BP (systolic 120-129 AND diastolic <80)", () => {
    expect(scoreBP("120/79")).toBe(2);
    expect(scoreBP("129/70")).toBe(2);
  });

  it("returns 3 for stage 1 (systolic 130-139 OR diastolic 80-89)", () => {
    expect(scoreBP("130/70")).toBe(3);
    expect(scoreBP("115/85")).toBe(3);
    expect(scoreBP("135/85")).toBe(3);
  });

  it("returns 4 for stage 2 (systolic >=140 OR diastolic >=90)", () => {
    expect(scoreBP("140/85")).toBe(4);
    expect(scoreBP("115/90")).toBe(4);
    expect(scoreBP("180/120")).toBe(4);
  });

  it("uses the higher risk stage when systolic and diastolic differ", () => {
    expect(scoreBP("150/70")).toBe(4);
    expect(scoreBP("125/85")).toBe(3);
  });

  it("returns 0 for invalid/missing data", () => {
    expect(scoreBP(null)).toBe(0);
    expect(scoreBP(undefined)).toBe(0);
    expect(scoreBP("")).toBe(0);
    expect(scoreBP("INVALID")).toBe(0);
    expect(scoreBP("N/A")).toBe(0);
    expect(scoreBP("150/")).toBe(0);
    expect(scoreBP("/90")).toBe(0);
    expect(scoreBP("abc/def")).toBe(0);
  });

  it("returns 0 for extra slash (e.g. '120/80/70')", () => {
    expect(scoreBP("120/80/70")).toBe(0);
  });

  it("handles whitespace-padded values", () => {
    expect(scoreBP(" 120 / 79 ")).toBe(2);
  });
});

describe("scoreTemp", () => {
  it("returns 0 for normal temperature (<=99.5)", () => {
    expect(scoreTemp(98.6)).toBe(0);
    expect(scoreTemp(99.5)).toBe(0);
    expect(scoreTemp(97.0)).toBe(0);
  });

  it("returns 1 for low fever (99.6-100.9)", () => {
    expect(scoreTemp(99.6)).toBe(1);
    expect(scoreTemp(100.0)).toBe(1);
    expect(scoreTemp(100.9)).toBe(1);
  });

  it("returns 2 for high fever (>=101.0)", () => {
    expect(scoreTemp(101.0)).toBe(2);
    expect(scoreTemp(103.5)).toBe(2);
  });

  it("accepts numeric strings (corrupt API data)", () => {
    expect(scoreTemp("98.6" as unknown as number)).toBe(0);
    expect(scoreTemp("101.0" as unknown as number)).toBe(2);
  });

  it("returns 0 for invalid/missing data", () => {
    expect(scoreTemp(null)).toBe(0);
    expect(scoreTemp(undefined)).toBe(0);
    expect(scoreTemp("TEMP_ERROR" as unknown as number)).toBe(0);
    expect(scoreTemp("invalid" as unknown as number)).toBe(0);
  });
});

describe("scoreAge", () => {
  it("returns 0 for under 40", () => {
    expect(scoreAge(25)).toBe(0);
    expect(scoreAge(39)).toBe(0);
  });

  it("returns 1 for 40-65 inclusive", () => {
    expect(scoreAge(40)).toBe(1);
    expect(scoreAge(50)).toBe(1);
    expect(scoreAge(65)).toBe(1);
  });

  it("returns 2 for over 65", () => {
    expect(scoreAge(66)).toBe(2);
    expect(scoreAge(80)).toBe(2);
  });

  it("returns 0 for negative/corrupt values", () => {
    expect(scoreAge(-5)).toBe(0);
    expect(scoreAge(-1)).toBe(0);
  });

  it("returns 0 for invalid/missing data", () => {
    expect(scoreAge(null)).toBe(0);
    expect(scoreAge(undefined)).toBe(0);
    expect(scoreAge("fifty-three" as unknown as number)).toBe(0);
    expect(scoreAge("unknown" as unknown as number)).toBe(0);
  });
});

describe("scorePatient", () => {
  it("computes total risk from BP + temp + age", () => {
    const patient: RawPatient = {
      patient_id: "P001",
      blood_pressure: "140/90",
      temperature: 101.5,
      age: 70,
    };
    const result = scorePatient(patient);
    expect(result.patientId).toBe("P001");
    expect(result.scores.bloodPressure).toBe(4);  // stage 2
    expect(result.scores.temperature).toBe(2);     // high fever
    expect(result.scores.age).toBe(2);             // over 65
    expect(result.scores.total).toBe(8);
    expect(result.hasFever).toBe(true);
    expect(result.hasDataQualityIssue).toBe(false);
  });

  it("flags data quality issues for invalid BP", () => {
    const patient: RawPatient = {
      patient_id: "P002",
      blood_pressure: "INVALID",
      temperature: 98.6,
      age: 30,
    };
    const result = scorePatient(patient);
    expect(result.scores.bloodPressure).toBe(0);
    expect(result.hasDataQualityIssue).toBe(true);
  });

  it("flags data quality issues for missing temperature", () => {
    const patient: RawPatient = {
      patient_id: "P003",
      blood_pressure: "120/80",
      temperature: null,
      age: 50,
    };
    const result = scorePatient(patient);
    expect(result.hasDataQualityIssue).toBe(true);
  });

  it("flags data quality issues for invalid age", () => {
    const patient: RawPatient = {
      patient_id: "P004",
      blood_pressure: "120/80",
      temperature: 98.6,
      age: "unknown",
    };
    const result = scorePatient(patient);
    expect(result.hasDataQualityIssue).toBe(true);
  });

  it("detects fever at exactly 99.6", () => {
    const patient: RawPatient = {
      patient_id: "P005",
      blood_pressure: "120/80",
      temperature: 99.6,
      age: 50,
    };
    const result = scorePatient(patient);
    expect(result.hasFever).toBe(true);
  });

  it("falls back to 'UNKNOWN' when patient_id is absent", () => {
    const result = scorePatient({});
    expect(result.patientId).toBe("UNKNOWN");
    expect(result.hasDataQualityIssue).toBe(true);
  });

  it("does not flag fever when temperature is missing", () => {
    const patient: RawPatient = { patient_id: "P006", temperature: null };
    const result = scorePatient(patient);
    expect(result.hasFever).toBe(false);
  });
});

describe("classifyPatients", () => {
  it("classifies pre-scored results into alert lists", () => {
    const patients: RawPatient[] = [
      { patient_id: "P001", blood_pressure: "150/95", temperature: 102.0, age: 70 },  // total=8, fever, no DQ
      { patient_id: "P002", blood_pressure: "110/70", temperature: 98.6, age: 30 },   // total=1, no fever, no DQ
      { patient_id: "P003", blood_pressure: "INVALID", temperature: 99.8, age: 50 },  // total=2, fever, DQ
      { patient_id: "P004", blood_pressure: "135/85", temperature: 98.6, age: 66 },   // total=5, no fever, no DQ
    ];
    const alerts = classifyPatients(patients.map(scorePatient));
    expect(alerts.high_risk_patients).toEqual(["P001", "P004"]);
    expect(alerts.fever_patients).toEqual(["P001", "P003"]);
    expect(alerts.data_quality_issues).toEqual(["P003"]);
  });

  it("returns empty lists for an empty input", () => {
    const alerts = classifyPatients([]);
    expect(alerts.high_risk_patients).toEqual([]);
    expect(alerts.fever_patients).toEqual([]);
    expect(alerts.data_quality_issues).toEqual([]);
  });
});
