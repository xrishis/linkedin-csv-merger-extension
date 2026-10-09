const ext = typeof chrome !== "undefined" ? chrome : browser;
const WANTED_COLUMNS = ["First Name", "Email Address", "Phone Number"];
const DEFAULT_SETTINGS = { onlyLikelyLinkedIn: true };

const statusEl = document.getElementById("status");
const statusText = document.getElementById("statusText");
const fileCountEl = document.getElementById("fileCount");
const rowCountEl = document.getElementById("rowCount");
const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const mergeBtn = document.getElementById("mergeBtn");
const clearBtn = document.getElementById("clearBtn");
const filterToggle = document.getElementById("filterToggle");
const statusMsgEl = document.getElementById("statusMessage");

function storageGet(keys) {
  return new Promise((resolve) => {
    ext.storage.local.get(keys, (result) => resolve(result || {}));
  });
}

function storageSet(values) {
  return new Promise((resolve) => {
    ext.storage.local.set(values, () => resolve());
  });
}

function getSettingsWithDefaults(settings = {}) {
  return {
    ...DEFAULT_SETTINGS,
    ...settings,
  };
}

function setMessage(message, isError = false) {
  statusMsgEl.classList.toggle("error", isError);
  statusMsgEl.textContent = message || "";
}

async function refreshStatus() {
  const { capturing, collectedRows = [], processedFiles = [], lastCaptureInfo = "", lastCaptureError = "", settings = {} } =
    await storageGet([
      "capturing",
      "collectedRows",
      "processedFiles",
      "lastCaptureInfo",
      "lastCaptureError",
      "settings",
    ]);

  const appliedSettings = getSettingsWithDefaults(settings);
  filterToggle.checked = appliedSettings.onlyLikelyLinkedIn;
  fileCountEl.textContent = `${processedFiles.length}`;
  rowCountEl.textContent = `${collectedRows.length}`;

  if (capturing) {
    statusEl.classList.add("on");
    statusText.textContent = `Capturing… ${processedFiles.length} file(s), ${collectedRows.length} row(s) collected`;
    startBtn.textContent = "Capturing…";
    startBtn.disabled = true;
    stopBtn.disabled = false;
    mergeBtn.disabled = collectedRows.length === 0;
  } else {
    statusEl.classList.remove("on");
    statusText.textContent =
      collectedRows.length > 0
        ? `Stopped. ${collectedRows.length} row(s) ready to merge.`
        : "Not capturing";
    startBtn.textContent = "Start capturing";
    startBtn.disabled = false;
    stopBtn.disabled = true;
    mergeBtn.disabled = collectedRows.length === 0;
  }

  clearBtn.disabled = collectedRows.length === 0 && processedFiles.length === 0;

  if (lastCaptureError) {
    setMessage(lastCaptureError, true);
  } else if (lastCaptureInfo) {
    setMessage(lastCaptureInfo, false);
  } else if (collectedRows.length === 0) {
    setMessage("Tip: enable only LinkedIn-like CSVs to avoid unrelated downloads.", false);
  } else {
    setMessage("");
  }
}

startBtn.addEventListener("click", async () => {
  const { settings = {} } = await storageGet("settings");

  await storageSet({
    capturing: true,
    collectedRows: [],
    processedFiles: [],
    processedDownloadIds: [],
    settings: getSettingsWithDefaults(settings),
    lastCaptureError: "",
    lastCaptureInfo: "Capture started. Download your LinkedIn exports now.",
  });
  refreshStatus();
});

stopBtn.addEventListener("click", async () => {
  // Stop watching for new CSV downloads, but keep collected rows so user can merge later.
  await storageSet({ capturing: false, lastCaptureInfo: "Capture stopped." });
  refreshStatus();
});

mergeBtn.addEventListener("click", async () => {
  const { collectedRows = [] } = await storageGet("collectedRows");

  if (collectedRows.length === 0) {
    setMessage("No rows collected yet — nothing to merge.", true);
    return;
  }

  const csvText = toCSV(collectedRows, WANTED_COLUMNS);
  const blob = new Blob([csvText], { type: "text/csv" });
  const url = URL.createObjectURL(blob);

  ext.downloads.download(
    {
      url,
      filename: "cleaned.csv",
      saveAs: true,
    },
    async () => {
      if (ext.runtime.lastError) {
        const message = ext.runtime.lastError.message || "Could not start download.";
        setMessage(message, true);
        URL.revokeObjectURL(url);
        return;
      }

      await storageSet({
        capturing: false,
        collectedRows: [],
        processedFiles: [],
        processedDownloadIds: [],
        lastCaptureInfo: "Merged and downloaded cleaned.csv.",
        lastCaptureError: "",
      });
      URL.revokeObjectURL(url);
      refreshStatus();
    }
  );
});

clearBtn.addEventListener("click", async () => {
  await storageSet({
    collectedRows: [],
    processedFiles: [],
    processedDownloadIds: [],
    lastCaptureError: "",
    lastCaptureInfo: "Cleared collected data.",
  });
  refreshStatus();
});

filterToggle.addEventListener("change", async () => {
  const { settings = {} } = await storageGet("settings");
  await storageSet({
    settings: {
      ...getSettingsWithDefaults(settings),
      onlyLikelyLinkedIn: filterToggle.checked,
    },
    lastCaptureInfo: filterToggle.checked
      ? "Only capturing LinkedIn-like CSV files."
      : "Capturing all CSV files.",
    lastCaptureError: "",
  });
  refreshStatus();
});

ext.storage.onChanged.addListener(() => {
  refreshStatus();
});

(async function init() {
  const { settings = {} } = await storageGet("settings");
  if (!settings || settings.onlyLikelyLinkedIn === undefined) {
    await storageSet({ settings: DEFAULT_SETTINGS });
  }

  refreshStatus();
})();

refreshStatus();
