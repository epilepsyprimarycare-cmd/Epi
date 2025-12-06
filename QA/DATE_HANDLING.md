
# Date Handling and Format Conventions

This short guide documents the canonical date handling strategy for Epicare across frontend and backend. The goal is consistent storage, display, and parsing so that users across different devices and locales have a consistent experience.

1) Canonical storage format (backend)
- Backend (Google Apps Script) uses DD/MM/YYYY with slashes as canonical stored format. All server-side functions (e.g., `completeFollowUp`, `updatePatientStatus`, `closeReferral`) write and return dates using this format via `formatDateDDMMYYYY`.

2) Frontend display format
- The UI uses a human-readable `DD-MM-YYYY` (with dashes) for display. Use `formatDateForDisplay()` in client code (from `js/utils.js`), which uses `DateUtils.formatForDisplay()` if available and falls back safely.

3) Client -> server serialization
- When sending dates to the backend, always use `formatDateForBackend()` from `js/utils.js`. This returns `DD/MM/YYYY` (slashes) by calling `DateUtils.formatDateDDMMYYYY()` if available.

4) Parsing incoming date values
- Use `parseDateFlexible()` (alias for `DateUtils.parse`) to read any of the following styles robustly:
  - DD/MM/YYYY or DD-MM-YYYY
  - ISO (YYYY-MM-DD or full ISO timestamp)
  - Native Date string
This ensures the app can handle data originating from different devices and regional settings.

5) Single source of truth
- Date formatting and parsing logic are centralized in `js/date-utils.js` (DateUtils). `js/utils.js` acts as a small compatibility wrapper. Avoid adding custom ad-hoc `new Date(...).toLocaleDateString()` calls for code that writes to the server.

6) Behavior across devices & locales
- `parseDateFlexible()` parses inputs robustly and avoids locale-specific misinterpretation. Frontend display uses `DateUtils.formatForDisplay` which can vary by locale if required (this is desirable for readability).
- Keep stored backend format consistent (DD/MM/YYYY) — this is the canonical representation used for comparisons and monthly resets.

7) Developer rules
- Use `formatDateForBackend()` when writing values to server columns such as `SubmissionDate`, `FollowUpDate`, `RegistrationDate`, `NextFollowUpDate`, `LastFollowUp`, etc.
- Use `formatDateForDisplay()` for any user-visible text or table columns.
- Use `parseDateFlexible()` when reading incoming data or when validating dates from user input, then pass parsed Date objects into `formatDateForBackend` or `formatDateForDisplay` as needed.
- Avoid manual formatting wherever possible to reduce inconsistencies.

8) Testing
- Ensure tests cover inputs from multiple formats and locales.
- Verify server roundtrips: client sends a date to server using `formatDateForBackend`, server persists `DD/MM/YYYY`, server returns `updatedPatient` with `LastFollowUp`/`NextFollowUpDate` stored as `DD/MM/YYYY`, client parses it with `parseDateFlexible` and displays `DD-MM-YYYY`.

By following these conventions, we ensure storage consistency and correct rendering across devices and locales.
