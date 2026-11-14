"use strict";

/**
 * Build a Question Bank page from the matches found in the current bounded scan.
 * When an extra match exists, resume after the last returned row to avoid skips.
 * When the scan limit is reached first, resume after the last scanned row.
 */
function selectQuestionBankPage({ matches, pageSize, lastScannedId, scanLimited }) {
  const page = matches.slice(0, pageSize);
  const hasExtraMatch = matches.length > pageSize;
  const nextCursor = hasExtraMatch
    ? page[page.length - 1].id
    : scanLimited ? lastScannedId : null;
  return { page, nextCursor, hasMore: Boolean(nextCursor) };
}

module.exports = { selectQuestionBankPage };
