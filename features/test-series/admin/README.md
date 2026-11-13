# Owner Admin Dashboard — isolated module

Mobile-first dashboard shell and Firebase Authentication MFA client helpers. Not yet wired into the main app; do not link until Firebase and backend authorization are configured.

## Login methods
- Google popup
- Email + password
- SMS OTP using Firebase Authentication Phone multi-factor authentication (MFA)

Link both primary providers to the same verified Owner Firebase UID. Enroll Phone MFA on that account. Firebase sign-in will then require the enrolled second factor.

## Security requirements
Every future admin read/write must be authorized server-side: authenticated ID token, exact UID in server-configured OWNER_UID, Firebase second-factor claim (`firebase.sign_in_second_factor === "phone"`), and valid App Check. Other MFA factor types do not satisfy the Owner phone-OTP requirement. Never grant admin rights through Firestore documents writable by clients, localStorage, URL parameters, or frontend flags. Keep admin Firestore rules deny-by-default. Never send answer keys to student clients before submission.

## Integration
Load admin-dashboard.html into the Test Series route only after app Firebase Auth is initialized. Import admin-auth.js from a module script and wire the controls. Keep this folder isolated from existing app modules.

## Not live yet
Cards are navigation placeholders. Cloud CRUD, question import, payment verification, reports, backup/restore, owner UID provisioning, MFA enrollment UX, App Check, and restrictive Firestore rules remain to be implemented. No deployment or billing changes were made.


## Test authoring validation
The owner test form uses the pure helper `admin-test-validation.mjs` before calling the backend. It checks the same question count, safe unique IDs, text/option limits, answer indexes, duration, price and marking ranges enforced by `ownerTestPayload`. Scheduled tests must have valid start/end values with the end strictly after the start. Server-side validation remains authoritative.

Run the isolated helper tests with Node.js 22:

```bash
node --test features/test-series/admin/tests/*.test.mjs
```
