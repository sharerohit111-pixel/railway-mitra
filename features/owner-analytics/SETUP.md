# Owner Analytics setup (operator checklist)

The dashboard and callable report endpoint are intentionally fail-closed. They show no fabricated metrics until the following setup is completed.

## 1. Grant owner access to the correct Firebase account

1. Sign in to Railway Mitra using the owner's account.
2. In Firebase Console, open Authentication > Users and copy that account's Firebase UID.
3. On a trusted developer computer with Firebase Admin Application Default Credentials configured for project `railway-mitra`, run:

```bash
cd functions
npm install
GOOGLE_CLOUD_PROJECT=railway-mitra npm run set-owner-admin -- <OWNER_FIREBASE_AUTH_UID>
```

4. Sign out and sign back in so the ID token refreshes. The existing script preserves other custom claims and adds `admin: true`. Never run this for an unverified UID.

## 2. Configure GA4 Data API access

1. In Google Cloud Console for project `railway-mitra`, enable the Google Analytics Data API.
2. Create a dedicated service account for read-only reporting. Do not download or commit its key into Git.
3. In Google Analytics Admin, open the correct GA4 property and copy its numeric Property ID (not the Measurement ID beginning with `G-`). Add the service account email under Property access management with Viewer access.
4. Store the numeric property ID as a Firebase Functions secret, then store the service account JSON securely as a separate secret:

```bash
firebase functions:secrets:set GA4_PROPERTY_ID
firebase functions:secrets:set GA_SERVICE_ACCOUNT_JSON
```

Enter the numeric GA4 Property ID when prompted for the first secret, then paste the complete service-account JSON for the second. Do not assume a remembered or sample ID is correct. Never put it in source code, GitHub, a client bundle, or chat.

## 3. Deploy and verify

From the repository root, deploy only after reviewing the draft pull request and confirming the project:

```bash
firebase deploy --only functions:getOwnerAnalyticsSummary --project railway-mitra
```

Then open `/features/owner-analytics/` while signed in as the owner. Verify realtime active users, seven-day active users, sessions/events and top event names. Initial data may take time to appear after users consent to analytics.

## Important limitations

- PWA install events are only observed where the browser emits `appinstalled`; they are not a complete installed-device count.
- This report currently returns realtime active users, seven-day active users, sessions, event count and top events. It does not yet report crashes, web vitals, device-level users or a reliable uninstall count.
- Never expose service-account credentials or admin custom claims to client code.
