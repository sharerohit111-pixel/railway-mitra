/**
 * Classify only the two expected outcomes of reading a student's prior CBT result.
 * Unknown, transport, auth and configuration failures must remain fatal to recovery.
 */
export function classifyCbtAttemptResultError(error) {
  const code = typeof error?.code === "string" ? error.code : "";
  const message = typeof error?.message === "string" ? error.message : "";
  if (code === "functions/failed-precondition" && message === "Exam result is not available yet") return "in_progress";
  if (code === "functions/permission-denied" && message === "Attempt not found") return "missing";
  return "fatal";
}
