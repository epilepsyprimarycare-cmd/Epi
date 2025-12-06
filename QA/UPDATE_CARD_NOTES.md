Follow-up Card Update - UI Behavior and Manual QA

Summary
-------
This file describes the frontend behavior for in-place patient card updates in follow-up UI and provides manual test steps. It also lists backend expectations so UI and server agree on fields used for updates.

Key scenarios handled by `updatePatientCardUI` (js/followup.js):
- Standard follow-up completed
- Patient referred to MO
- Patient returned to PHC
- Patient referred to Tertiary

Design Principles
-----------------
- Updates are always attempted in-place to avoid a full list reload unless a fallback is required.
- In-memory `window.allPatients` is updated with the server's authoritative patient object if available; otherwise we optimistically merge follow-up payload into the local patient data.
- The UI only inserts or removes cards when the current user role is allowed to see them.
- Duplicate DOM cards for the same patient are removed before insertion to avoid duplicates across lists.

Expected Backend Field Changes
------------------------------
- On follow-up submission, the backend should update the Patients sheet and return the updated patient object in response, including:
  - PatientStatus: 'Follow-up', 'Referred to MO', 'Referred to Tertiary', 'Deceased', 'Inactive', etc.
  - FollowUpStatus: 'Completed for <Month> <Year>' for completed follow-ups; 'Pending' otherwise.
  - LastFollowUp: updated to the follow-up date
  - NextFollowUpDate: optional, for when the server computes it.

Manual QA Steps
---------------
1. Standard completion
   - Open a patient card that is otherwise due for a follow-up.
   - Submit a follow-up with a FollowUpDate and no referral flags.
   - Expected: Card gets styled as 'Completed', button is disabled and shows 'Follow-up Complete', Last Follow-up date is updated, Next Due appears.

2. Patient referred to MO
   - Submit a follow-up with ReferredToMO = 'Yes'.
   - Expected: The patient card is removed from the current follow-up grid and added to the 'Referred' grid in-place (if visible to role), without reloading entire list. In-memory status is updated to 'Referred to MO'.

3. Patient returned to PHC
   - Set returnToPhc = 'Yes' or use corresponding backend endpoint to mark a patient as returned.
   - Expected: The patient is removed from the referenced 'Referred' list and re-inserted into the follow-up grid (if visible to the current user), without reloading entire list.

4. Patient referred to Tertiary
   - Mark the follow-up as ReferredToTertiary = 'Yes' or set PatientStatus to 'Referred to Tertiary' from backend.
   - Expected: The card is moved (or styled) for tertiary queue. The card is disabled and shows tertiary status; if a dedicated tertiary queue is shown, the card appears there.

Developer Helper
----------------
- A utility `window._testUpdateScenarios(patientId)` exists to simulate the four scenarios and validate in-place card updates. Use this in the browser console for smoke checks.
 - A utility `window._smokeTestApiScenarios(patientId)` has been added to run API-backed smoke tests for the four scenarios (Complete / Referred to MO / Return to PHC / Referred to Tertiary).
   Export changes:
   - The `Export Monthly Follow-up Status` button in the Management tab now supports Excel (.xlsx) multi-sheet export using SheetJS for master admin. The workbook includes an 'All Facilities' sheet and one sheet per PHC.
   - The export is also available to `phc_admin`; when a PHC admin uses it, only data for their assigned PHC is exported (single sheet) and other export buttons are hidden.
    - **User export disabled:** Export of the Users sheet (including Password or token fields) has been disabled in the UI and server to prevent accidental leakage of sensitive credentials. The `Export Users` button has been removed and `getUsers` now filters sensitive fields server-side.
       * Attempting to export users via the UI shows an error: "Exporting user data has been disabled for security compliance.".
       * The server `getUsers` endpoint returns user metadata but strips sensitive fields (Password, PasswordHash, PasswordSalt, SessionToken, tokens, API keys).
    - The management export UI is now consolidated in `js/adminManagement.js` (function `initManagementExports`), which overrides the static HTML inside `adminExportContainer` and adds role-based visibility.
       * If you previously embedded the `exportMonthlyFollowUpStatusBtn` in `index.html`, the `adminManagement.js` override may replace that markup — this is by design. The export button is now added inside `initManagementExports` and should be present for both master and PHC admins.
    * Use it via console: `window._smokeTestApiScenarios('1234')` and watch console logs & UI updates.

Notes & Recommendations
------------------------
- Backend must consistently set `PatientStatus` and `FollowUpStatus` for the UI to be fully consistent across refreshes and multi-user changes.
   - PatientStatus is the **single source of truth** for whether a patient is currently referred. Follow-up rows (FollowUps) are audit/log records that may contain referral flags (`ReferredToMO`, `ReferredToTertiary`), but should not be used to decide current UI lists or filters.
- Avoid having multiple follow-up cards for the same patient across lists. The UI removes duplicates when adding cards.
- Ensure roles & PHC filters are enforced in the backend as well as in UI to avoid unauthorized data visibility.

Backend/API changes now available
-------------------------------
- A server API `closeReferral(patientId, options)` was implemented. It:
   - Sets `ReferralClosed` to 'Yes' (if the column exists).
   - Adds/updates `ReferralClosedBy` (caller-provided user) and `ReferralClosedOn` (DD/MM/YYYY).
   - Sets `PatientStatus` to 'Follow-up' (so the patient may reappear in follow-up lists).

   Note: Avoid duplicating update logic (do not set the "PatientStatus" cell directly from multiple server endpoints). Use `updatePatientStatus(patientId, status, referralDetails)` from `patients.gs` to ensure consistent updates and to return `updatedPatient`.
   - Returns the updated patient object as `updatedPatient` in the response for client-side in-memory sync.

   - The `updatePatientStatus` API now returns the authoritative `updatedPatient` object in the response (mirroring `completeFollowUp` behavior). Front-end clients should use `updatedPatient` from the response to update local `window.allPatients` and avoid extra fetches.

Date Format Notes
-----------------
- The backend stores dates in DD/MM/YYYY (slashes) and continues to use this format for LastFollowUp/NextFollowUpDate.
- Frontend will show dates using DD-MM-YYYY (dashes) in the UI for readability but will send dates to the backend in DD/MM/YYYY (slashes) to match server conventions.
- If you find inconsistent date formats in tests, check `window.lastFollowUpSubmissionDebug.requestBody` to see the encoded POST body and `window.lastFollowUpSubmissionDebug.response` for the server response.

If anything unexpected occurs during tests, open dev tools and inspect `window.lastFollowUpSubmissionDebug` for the last submission event and `window.allPatients` array to check current in-memory patient state.

Follow-up CSV Export (Monthly) - QA Steps
----------------------------------------
- The Follow-up tab includes a button labeled `Download This Month's Follow-ups (CSV)` and (for master admins) month/year selectors.
- Master Admin: Verify selectors are visible. Pick a month and year (or choose the PHC filter) and click the CSV button. The CSV should contain the expected data for the selected month/year and the selected PHC (or all PHCs if no PHC filter selected). Filename example: `FollowUps_AllPHCs_2025-11.csv`.
- PHC Admin/Staff: Verify selectors are hidden; clicking the CSV button downloads CSV for the current month only and is scoped to their assigned PHC.
- The CSV includes the following columns in this order: `Code, PHC, PatientID, PatientName, Phone, FollowUpDate, SubmittedBy, SeizureFrequency, TreatmentAdherence, ReferredToMO, ReferralClosed, Notes`.
- If there are no follow-ups for the selected month/PHC, the UI shows a notification and no CSV is downloaded.
- Check for proper escaping of special characters (commas, quotes, line breaks) in exported fields.
- Verify that the CSV download completes and the notification reads: "CSV downloaded successfully.".