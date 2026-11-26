export function isValidTrainNumber(value, trainType) {
  const trainNumber = String(value ?? "").trim().toUpperCase();
  if (!trainNumber) return true;
  if (trainType === "passenger") return /^\d{4,6}$/.test(trainNumber);
  if (trainType === "goods") return /^[A-Z0-9-]{2,10}$/.test(trainNumber);
  return false;
}
