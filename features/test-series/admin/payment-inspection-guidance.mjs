const ORDER_STATUSES = new Set(["created", "attempted", "paid"]);
const PAYMENT_STATUSES = new Set(["created", "authorized", "captured", "refunded", "failed"]);
const CAPTURED_HISTORY = new Set(["captured", "refunded"]);

export function getPaymentInspectionGuidance({ matchesRequest, orderStatus, payments } = {}) {
  if (matchesRequest !== true) {
    return "सुरक्षा निर्णय: स्थानीय request और Provider Order का मिलान नहीं हुआ। कोई कार्रवाई न करें; मैन्युअल समीक्षा आवश्यक है।";
  }

  // This helper is display-only, but it must never turn an unknown provider
  // state or malformed response into advice that another checkout is safe.
  if (!ORDER_STATUSES.has(orderStatus) || !Array.isArray(payments) ||
      payments.some(payment => !payment || typeof payment !== "object" ||
        Array.isArray(payment) || !PAYMENT_STATUSES.has(payment.status))) {
    return "सुरक्षा निर्णय: Provider से अपरिचित या अधूरा Order/Payment Status मिला। Provider और स्थानीय payment ledger/entitlement की मैन्युअल समीक्षा करें; retry न सुझाएँ और lock न हटाएँ।";
  }

  const hasCapturedHistory = payments.some(payment => CAPTURED_HISTORY.has(payment.status));
  const hasAuthorization = payments.some(payment => payment.status === "authorized");

  if (orderStatus === "paid" && !hasCapturedHistory) {
    return "सुरक्षा निर्णय: Razorpay Order paid है, लेकिन भुगतान सूची में captured/refunded रिकॉर्ड नहीं मिला। यह असंगति है; Provider और स्थानीय payment ledger/entitlement की मैन्युअल समीक्षा करें। lock न हटाएँ।";
  }
  if (hasCapturedHistory) {
    return "सुरक्षा निर्णय: इस Order पर capture का इतिहास मिला है (रिफंड हुआ भुगतान भी पहले capture हुआ था)। भुगतान ledger और entitlement का मिलान करें; lock स्वयं न हटाएँ।";
  }
  if (hasAuthorization) {
    return "सुरक्षा निर्णय: कम-से-कम एक भुगतान authorized है। देर से capture या refund संभव है; lock न हटाएँ।";
  }
  return "सुरक्षा निर्णय: Order अभी created/attempted है या प्रयास failed हैं। Razorpay Order पर दोबारा भुगतान संभव है; failed प्रयास देखकर lock न हटाएँ।";
}
