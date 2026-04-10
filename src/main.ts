import { fetchAllPatients, submitAssessment } from "./client.js";
import { classifyPatients, scorePatient } from "./scoring.js";

const API_KEY = process.env.API_KEY;
if (!API_KEY) {
  console.error("Missing API_KEY environment variable. Set it in .env or export it.");
  process.exit(1);
}

// Re-read as a typed constant so TypeScript knows it is a non-optional string
// inside `main()`, regardless of how narrowing propagates across the closure.
const apiKey: string = API_KEY;

async function main() {
  console.log("Fetching all patients...");
  const patients = await fetchAllPatients(apiKey);
  console.log(`Fetched ${patients.length} patients.`);

  // Score each patient once; reuse results for both logging and classification.
  const results = patients.map(scorePatient);

  console.log("\n--- Patient Scores ---");
  for (const r of results) {
    console.log(
      `${r.patientId}: BP=${r.scores.bloodPressure} Temp=${r.scores.temperature} Age=${r.scores.age} Total=${r.scores.total}` +
        (r.hasFever ? " [FEVER]" : "") +
        (r.hasDataQualityIssue ? " [DQ]" : ""),
    );
  }

  // Classify pre-scored results into alert lists (no re-scoring).
  const alerts = classifyPatients(results);

  console.log("\n--- Alert Lists ---");
  console.log("High Risk:", alerts.high_risk_patients);
  console.log("Fever:", alerts.fever_patients);
  console.log("Data Quality:", alerts.data_quality_issues);

  // Submit (retries on transient failures).
  console.log("\nSubmitting assessment...");
  const response = await submitAssessment(apiKey, alerts);
  console.log("\n--- Submission Response ---");
  console.log(JSON.stringify(response, null, 2));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
