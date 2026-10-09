// Minimal, dependency-free CSV parser that handles quoted fields,
// commas inside quotes, and escaped double-quotes ("").

const FIELD_ALIASES = {
  "First Name": ["first name", "first", "given name", "firstname"],
  "Email Address": ["email", "email address", "emailaddress", "primary email", "e-mail", "e mail"],
  "Phone Number": [
    "phone",
    "phone number",
    "phone #",
    "mobile",
    "mobile phone",
    "telephone",
  ],
};

function parseCSV(text) {
  text = String(text ?? "");

  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  // Normalize line endings.
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text.trim()) return [];

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ",") {
        row.push(field);
        field = "";
      } else if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }
  }
  // last field/row (if file doesn't end with newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop fully empty trailing rows
  while (rows.length && rows[rows.length - 1].every((c) => c.trim() === "")) {
    rows.pop();
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map((h) => String(h).trim().replace(/\uFEFF/g, ""));
  const records = [];
  for (let r = 1; r < rows.length; r++) {
    const obj = {};
    if (!rows[r] || rows[r].every((value) => String(value).trim() === "")) continue;

    headers.forEach((h, idx) => {
      obj[h] = rows[r][idx] !== undefined ? rows[r][idx] : "";
    });
    records.push(obj);
  }
  return records;
}

function normalizeHeaderForMatch(value) {
  return String(value ?? "")
    .replace(/\uFEFF/g, "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

// Case/whitespace-insensitive lookup of a field on a parsed row object,
// since LinkedIn's export headers can vary slightly between exports.
function getField(record, wantedName) {
  const target = normalizeHeaderForMatch(wantedName);
  const aliases = FIELD_ALIASES[wantedName] || [wantedName];

  for (const key of Object.keys(record)) {
    const normalizedKey = normalizeHeaderForMatch(key);
    const allTargets = [wantedName, ...aliases].map(normalizeHeaderForMatch);

    if (allTargets.includes(normalizedKey)) {
      return record[key];
    }
  }
  return "";
}

function toCSV(records, columns) {
  const lines = [];
  lines.push(columns.map(csvEscape).join(","));
  for (const rec of records) {
    lines.push(columns.map((c) => csvEscape(rec[c] ?? "")).join(","));
  }
  return lines.join("\r\n");
}

function csvEscape(value) {
  value = protectSpreadsheetFormula(String(value ?? ""));
  if (/[",\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function protectSpreadsheetFormula(value) {
  if (value === "") return value;

  const trimmed = value.replace(/^[\s]+/u, "");
  if (/^[=+\-@]/.test(trimmed)) {
    return "'" + value;
  }

  return value;
}

// Only in a service worker context does `self.importScripts` style sharing
// matter; in the popup this file is loaded via a normal <script> tag, so no
// module exports are needed either way.
