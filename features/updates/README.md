# Railway Updates — notice publishing guide

## Current publishing model

The public page reads `notices.json` from this feature folder. The feed is intentionally empty until a notice has been checked against the issuing authority's original publication.

For this first release, publishing is a **manual GitHub content update** by the repository owner/maintainer. There is no public submission form, admin dashboard, automatic scraping, scheduler, push notification, or Firebase integration in this module.

## Required fields

Each notice object must contain:

- `id`: unique stable identifier, e.g. `rb-2026-001`
- `category`: one of `rbe`, `pay`, `exam`, `transfer`, `medical`, `zone`, `other`
- `titleEn`, `titleHi`: concise title in both languages
- `summaryEn`, `summaryHi`: factual summary in both languages
- `sourceName`: issuing authority / official portal name
- `sourceUrl`: HTTPS link to the original order or official notice
- `verified`: must be boolean `true` only after checking the original source
- `publishedAt`: publication date in `YYYY-MM-DD`

Optional fields:

- `rbeNumber`: exact circular/order number as printed by the authority
- `deadline`: confirmed deadline in `YYYY-MM-DD`
- `keywords`: searchable terms

## Example record (illustrative only — do not publish this sample)

```json
{
  "id": "example-do-not-publish",
  "category": "rbe",
  "titleEn": "Illustrative circular title",
  "titleHi": "उदाहरण शीर्षक",
  "summaryEn": "Replace with a factual summary of the original order.",
  "summaryHi": "मूल आदेश का तथ्यात्मक सार यहाँ लिखें।",
  "rbeNumber": "Copy exact number from source, if applicable",
  "publishedAt": "2026-01-15",
  "deadline": "2026-02-15",
  "sourceName": "Issuing authority",
  "sourceUrl": "https://official.example.gov.in/original-notice.pdf",
  "verified": true,
  "keywords": "leave, establishment, RBE"
}
```

The example URL and values are placeholders and must never be published.

## Safe publishing checklist

1. Open the original Railway Board / relevant Zonal Railway / Division / competent authority notice.
2. Confirm the issuing authority, exact order number, publication date, applicability and any deadline.
3. Summarize without changing eligibility, conditions, dates or legal meaning. Do not present interpretation as an official direction.
4. Provide both English and Hindi titles and summaries.
5. Link directly to the original official notice (HTTPS). Do not use URL shorteners, social-media forwards or third-party copies as the source.
6. Set `verified: true` only after the checks above. Add the item to `notices.json` and review the JSON syntax.
7. Submit a pull request or commit for maintainer review. Check the rendered page, both languages, search, category filter and source link before publishing.
8. For a corrigendum, cancellation or superseding order, update or mark the earlier item clearly; do not leave an obsolete deadline looking current.

## Data integrity

- Never invent an RBE number, date, deadline, benefit, eligibility condition or official source.
- Do not publish employee personal data or confidential/internal documents.
- Do not claim real-time alerts. The page currently displays a feed when the user opens it and has no push notification service.
- The front-end ignores records without `verified: true` and required fields. This is a display safeguard, not an authorization system; repository access control and human review remain essential.

## Local draft workspace

Open `publisher.html` from the deployed app or local preview to prepare a notice draft. The page validates required fields, bilingual text, category, date order and HTTPS source URL, then exports `notices-draft.json`.

**Security limitation:** this is not an authenticated admin panel and it does not publish directly. Drafts remain in page memory until export; closing/reloading the page clears them. Do not rely on an unlinked URL as access control. Only an authorized repository maintainer should review the original source and merge verified records into `notices.json`.

A truly authenticated live publisher requires a trusted sign-in integration and a server-side callable function enforcing the existing Firebase Admin custom claim `admin: true`. Do not add client-side admin flags, passwords, GitHub tokens or public write access. That backend and deployment are deliberately not part of this change.


## Category PDF library

The Updates page now includes a PDF library scoped to the seven existing notice categories. Public visitors can view/download uploaded PDFs. The upload panel is shown only after Firebase Auth confirms the signed-in user's refreshed ID token contains the server-issued `admin: true` claim.

PDFs are stored under `updates/{category}/{uid}/{timestamp}-{filename}.pdf` in Firebase Storage. Uploads are limited to PDF MIME type and 20 MB. Each object stores a title, optional description, category, uploader UID and timestamp in custom metadata. The UI lists documents by the selected category; the owner admin can delete documents uploaded by their own UID.

### Deployment prerequisites and security

- Confirm the Firebase Storage bucket `railway-mitra.firebasestorage.app` exists and is enabled in the Firebase project.
- Export/review the currently deployed Storage rules before deploying `storage.rules`. This repository's rules file previously documented that the live rules were not confirmed; do not overwrite live rules without merging every existing rule.
- Merge the new `updates/{category}/{uid}/{fileName}` match block into the verified live rules and deploy Storage Rules.
- Confirm the trusted server-side process has assigned the custom claim `admin: true` only to the owner account. A hidden panel is only a UI convenience; Storage Rules are the actual write boundary.
- Public read access is intentional for PDFs published in Railway Updates. Do not upload private employee records, personal documents or confidential internal material.
- Firebase Storage billing/availability may affect upload. The feature must be tested after bucket and rules deployment.
