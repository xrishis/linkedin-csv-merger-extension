importScripts("csv-utils.js");

const ext = typeof chrome !== "undefined" ? chrome : browser;
const WANTED_COLUMNS = ["First Name", "Email Address", "Phone Number"];
const OUTPUT_FILENAME = "cleaned.csv";
const DEFAULT_SETTINGS = { onlyLikelyLinkedIn: true };
const LINKEDIN_HINTS = ["linkedin", "connection", "connections", "export"];

let ingestQueue = Promise.resolve();

function storageGet(keys) {
  return new Promise((resolve) => {
    ext.storage.local.get(keys, (result) => {
      resolve(result || {});
    });
  });
}

function storageSet(values) {
  return new Promise((resolve) => {
    ext.storage.local.set(values, () => resolve());
  });
}

function localPathToFileUrl(path) {
  const normalized = String(path || "").replace(/\\/g, "/").trim();
  if (!normalized) return "";

  const withoutLeadingSlash = normalized.startsWith("/") ? normalized.slice(1) : normalized;
  const parts = withoutLeadingSlash.split("/").filter((part, index) => index === 0 || part.length > 0);
  const encodedParts = parts.map((segment, index) => {
    if (index === 0 && /^[A-Za-z]:$/.test(segment)) return segment;
    return encodeURIComponent(segment);
  });

  return "file:///" + encodedParts.join("/");
}

function isLikelyLinkedInDownload(records, filename) {
  if (!Array.isArray(records) || records.length === 0) return false;

  const firstRecord = records[0] || {};
  const headers = Object.keys(firstRecord).map((header) => normalizeHeaderForMatch(header));

  for (const required of WANTED_COLUMNS) {
    if (headers.includes(normalizeHeaderForMatch(required))) return true;
  }

  const filenameLower = filename.toLowerCase();
  if (LINKEDIN_HINTS.some((hint) => filenameLower.includes(hint))) return true;

  return headers.some((header) => ["first name", "email", "phone", "connection"].includes(header));
}

function getSettingsWithDefaults(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
  };
}

function searchDownloadById(downloadId) {
  return new Promise((resolve) => {
    ext.downloads.search({ id: downloadId }, (items) => {
      resolve(items || []);
    });
  });
}

function ensureDefaults() {
  storageGet("settings").then((state) => {
    storageSet({
      settings: {
        ...DEFAULT_SETTINGS,
        ...(state.settings || {}),
      },
    });
  });
}

async function handleCompletedDownload(downloadItem) {
  const filename = downloadItem.filename || "";
  const base = filename.split(/[\\/]/).pop();

  if (!base || !base.toLowerCase().endsWith(".csv")) return;
  if (base.toLowerCase() === OUTPUT_FILENAME.toLowerCase()) return; // skip our own output

  const state = await storageGet([
    "capturing",
    "processedFiles",
    "processedDownloadIds",
    "settings",
  ]);
  const capturing = !!state.capturing;
  if (!capturing) return;

  const processedFiles = Array.isArray(state.processedFiles) ? state.processedFiles : [];
  const processedDownloadIds = Array.isArray(state.processedDownloadIds)
    ? state.processedDownloadIds
    : [];

  if (processedFiles.includes(filename) || processedDownloadIds.includes(downloadItem.id)) return;

  let text = "";
  try {
    const fileUrl = localPathToFileUrl(filename);
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error("HTTP " + response.status);
    text = await response.text();
  } catch (err) {
    console.error(
      `[LinkedIn CSV Merger] Could not read "${filename}". ` +
        `Make sure "Allow access to file URLs" is enabled for this extension in chrome://extensions.`,
      err
    );
    await storageSet({
      lastCaptureError:
        "Could not read " +
        base +
        ". Ensure file URL access is enabled for this extension in chrome://extensions.",
      lastCaptureInfo: "",
    });
    return;
  }

  const records = parseCSV(text);

  if (records.length === 0) {
    await storageSet({
      lastCaptureError: "Skipped " + base + " because it has no data rows.",
      processedFiles: processedFiles.concat(filename),
      processedDownloadIds: processedDownloadIds.concat(downloadItem.id),
      lastCaptureInfo: "",
    });
    return;
  }

  const settings = getSettingsWithDefaults(state.settings);
  if (settings.onlyLikelyLinkedIn && !isLikelyLinkedInDownload(records, base)) {
    await storageSet({
      processedFiles: processedFiles.concat(filename),
      processedDownloadIds: processedDownloadIds.concat(downloadItem.id),
      lastCaptureInfo: "Skipped " + base + " (does not look like a LinkedIn export).",
      lastCaptureError: "",
    });
    return;
  }

  const cleanedRecords = records.map((rec) => {
    const out = {};
    for (const col of WANTED_COLUMNS) {
      out[col] = getField(rec, col);
    }
    return out;
  });

  const stateRows = await storageGet("collectedRows");
  const collectedRows = Array.isArray(stateRows.collectedRows) ? stateRows.collectedRows : [];
  const updatedRows = collectedRows.concat(cleanedRecords);

  await storageSet({
    collectedRows: updatedRows,
    processedFiles: processedFiles.concat(filename),
    processedDownloadIds: processedDownloadIds.concat(downloadItem.id),
    lastCaptureError: "",
    lastCaptureInfo: `Captured ${cleanedRecords.length} row(s) from ${base}`,
  });
}

function enqueueDownloadCompletion(downloadId) {
  ingestQueue = ingestQueue
    .then(async () => {
      const items = await searchDownloadById(downloadId);
      if (!items || !items[0]) return;
      await handleCompletedDownload(items[0]);
    })
    .catch((error) => {
      console.error("[LinkedIn CSV Merger] Queue error:", error);
    });
}

ext.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current === "complete") {
    enqueueDownloadCompletion(delta.id);
  }
});

ext.runtime.onInstalled.addListener(() => {
  ensureDefaults();
});

ext.runtime.onStartup.addListener(() => {
  ensureDefaults();
});
