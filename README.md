# LinkedIn CSV Merger + Cleaner (Chrome Extension)

Same idea as your `Merge_CSV.bat`, but automatic: it watches your downloads,
and grabs every CSV that lands while it's `capturing`, then merges and
cleans them into one `cleaned.csv` with columns: `First Name`, `Email Address`,
and `Phone Number`.

## One-page user guide

[Download the illustrated How to Use PDF](output/pdf/LinkedIn_CSV_Merger_How_To_Use.pdf)

## Install (unpacked, for personal use)

1. Unzip this folder somewhere permanent (don't delete it after installing —
   Chrome loads the extension files directly from this folder).
2. Open your Chromium browser's extensions page (`chrome://extensions` in Chrome,
   Brave, and Opera, or `edge://extensions` in Microsoft Edge).
3. Turn on **Developer mode**.
4. Click **Load unpacked**, and select this folder.
5. Click **Details** on this extension and enable **Allow access to file URLs**.
   This is required so the background worker can read downloaded files.

## Use it

1. Open the popup and click **Start capturing**.
2. Export your LinkedIn connections (`Settings → Data privacy → Get a copy of your data → Connections`).
3. Every CSV that finishes downloading while capturing is on is imported in the background.
4. The optional filter can be used to skip non-LinkedIn CSVs.
5. Click **Merge & download** to export all collected rows as `cleaned.csv`.
6. Use **Clear data** to reset the session anytime.

## What changed in this version

- Added safe handling for download race conditions so concurrent downloads don't overwrite each other.
- Fixed Windows file URL conversion (which can break on colon-encoded paths).
- Added a safer merge pipeline:
  - deduplicates on file/download id,
  - ignores empty/invalid CSVs,
  - stores status messages and displays them in the popup.
- Added formula-risk hardening in generated CSV output (prepends apostrophe to dangerous field values).
- Added a new popup UI with counters, merged status messages, and filter + clear controls.

## Notes / limitations

- It only captures files that finish downloading while capturing is active.
- If you need to include every CSV file, turn off the LinkedIn filter.
- Header matching is case/spaces/punctuation tolerant with common aliases.
- If a column is missing for a given export, that cell is left blank.
- Everything runs locally in the browser. No data is uploaded.
