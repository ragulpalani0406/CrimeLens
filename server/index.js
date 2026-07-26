import dotenv from "dotenv";
dotenv.config({ override: true });
import cookieParser from "cookie-parser";
import authRouter from "./auth.js";
import express from "express";
import cors from "cors";
import multer from "multer";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import path, { extname } from "node:path";
import { fileURLToPath } from "node:url";
import mongoose from "mongoose";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// ── MongoDB connection ────────────────────────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI;

if (MONGODB_URI) {
  mongoose
    .connect(MONGODB_URI)
    .then(() => console.log("✓ MongoDB connected"))
    .catch((err) => console.error("✗ MongoDB connection failed:", err.message));
} else {
  console.warn(
    "⚠ MONGODB_URI not set in .env — running without persistent DB. Auth features may fail."
  );
}

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

// ── File upload config ────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
});

// ── In-memory dataset store (survives per server session) ─────────────────────
let latestDatasets = [];
let latestTables = [];
let latestDocuments = [];

// ── Auth routes ───────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);

// ── Utility helpers ───────────────────────────────────────────────────────────
function getValue(row, words) {
  const key = Object.keys(row).find((col) =>
    words.some((w) => col.toLowerCase().includes(w))
  );
  return key ? String(row[key] ?? "").trim() : "";
}

function groupCount(rows, words) {
  const result = {};
  for (const row of rows) {
    const value = getValue(row, words) || "Unknown";
    result[value] = (result[value] || 0) + 1;
  }
  return Object.entries(result).sort((a, b) => b[1] - a[1]);
}

function suggestRole(columnName) {
  const col = columnName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const rules = [
    { role: "Case ID", pattern: /(caseid|caseno|firno|firnumber|crimeid|reportid)/ },
    { role: "Incident Date", pattern: /(date|datetime|timestamp|occurred|reported)/ },
    { role: "Crime Type", pattern: /(crimetype|crime|offence|offense|category|section)/ },
    { role: "District / Station", pattern: /(district|station|police|area|location|place|city|ward|village)/ },
    { role: "Case Status", pattern: /(status|closed|open|pending|solved)/ },
    { role: "Person Reference", pattern: /(accused|suspect|victim|person|name)/ },
    { role: "Latitude", pattern: /(latitude|lat)/ },
    { role: "Longitude", pattern: /(longitude|lng|lon)/ },
  ];
  const matched = rules.find((r) => r.pattern.test(col));
  return {
    suggestedAs: matched ? matched.role : "Unmapped",
    confidence: matched ? "High" : "Low",
  };
}

function createTableResult(file, format, rows, extra = {}) {
  if (!rows.length) throw new Error(`${file.originalname} has no readable rows.`);
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return {
    summary: {
      fileName: file.originalname,
      format,
      kind: "table",
      uploadedAt: new Date().toISOString(),
      totalRecords: rows.length,
      columns,
      preview: rows.slice(0, 5),
      ...extra,
    },
    rows,
  };
}

function createDocumentResult(file, format, text) {
  const cleanText = text.trim();
  if (!cleanText) throw new Error(`${file.originalname} contains no readable text.`);
  return {
    summary: {
      fileName: file.originalname,
      format,
      kind: "document",
      uploadedAt: new Date().toISOString(),
      totalRecords: 0,
      columns: [],
      preview: [],
      textPreview: cleanText.slice(0, 1600),
      textLength: cleanText.length,
    },
    rows: null,
    text: cleanText,
  };
}

async function analyseFile(file) {
  const extension = extname(file.originalname).toLowerCase();

  if (extension === ".csv") {
    const rows = parse(file.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      bom: true,
      relax_column_count: true,
    });
    return createTableResult(file, "CSV", rows);
  }

  if (extension === ".xlsx" || extension === ".xls") {
    const workbook = XLSX.read(file.buffer, { type: "buffer" });
    const sheets = workbook.SheetNames.map((sheetName) => ({
      sheetName,
      rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" }),
    }));
    const firstSheet = sheets.find((s) => s.rows.length > 0);
    if (!firstSheet) throw new Error(`${file.originalname} has no readable Excel rows.`);
    return createTableResult(
      file,
      "Excel",
      sheets.flatMap((s) => s.rows),
      { sheetNames: sheets.map((s) => s.sheetName), preview: firstSheet.rows.slice(0, 5) }
    );
  }

  if (extension === ".txt") {
    return createDocumentResult(file, "Text file", file.buffer.toString("utf-8"));
  }

  if (extension === ".json") {
    const value = JSON.parse(file.buffer.toString("utf-8"));
    return createTableResult(file, "JSON", Array.isArray(value) ? value : [value]);
  }

  throw new Error(`${file.originalname}: unsupported file type. Supported: CSV, XLSX, XLS, TXT, JSON`);
}

function profileTable(table) {
  const columns = [...new Set(table.rows.flatMap((r) => Object.keys(r)))];
  return {
    fileName: table.fileName,
    format: table.format,
    totalRecords: table.rows.length,
    columns: columns.map((col) => {
      const values = table.rows.map((r) => r[col]);
      const missingCount = values.filter(
        (v) => v === null || v === undefined || String(v).trim() === ""
      ).length;
      return {
        name: col,
        missingCount,
        uniqueValues: new Set(values.map((v) => String(v))).size,
        ...suggestRole(col),
      };
    }),
  };
}

// ── AI Assistant ──────────────────────────────────────────────────────────────
app.post("/api/assistant/ask", (req, res) => {
  const question = String(req.body?.question || "").trim().toLowerCase();

  if (!question) {
    return res.status(400).json({ error: "Question is required" });
  }

  const rows = latestTables.flatMap((t) => t.rows || []);
  const fileNames = latestTables.map((t) => t.fileName);

  if (rows.length === 0 && latestDocuments.length === 0) {
    return res.json({
      answer:
        "No crime records are loaded yet. Please upload a dataset in the Case Vault first, then I can analyse it for you.",
      evidenceCards: [],
    });
  }

  // ── Build evidence cards helper ────────────────────────────────────────────
  function buildEvidenceCards(entries, colLabel) {
    return entries.slice(0, 5).map(([name, count]) => ({
      title: name,
      detail: `${count} record${count !== 1 ? "s" : ""}`,
      column: colLabel,
      sources: fileNames,
    }));
  }

  // ── Query: total / count / how many ───────────────────────────────────────
  if (
    question.includes("how many") ||
    question.includes("total") ||
    question.includes("count") ||
    question.includes("records")
  ) {
    const perFile = latestTables.map((t) => `${t.fileName}: ${t.rows.length}`).join(", ");
    return res.json({
      answer: `Your uploaded datasets contain **${rows.length.toLocaleString()} records** across ${latestTables.length} file(s). Breakdown: ${perFile}.`,
      evidenceCards: latestTables.map((t) => ({
        title: t.fileName,
        detail: `${t.rows.length} records`,
        column: "All columns",
        sources: [t.fileName],
      })),
    });
  }

  // ── Query: district / area / location ─────────────────────────────────────
  if (
    question.includes("district") ||
    question.includes("area") ||
    question.includes("location") ||
    question.includes("station") ||
    question.includes("place") ||
    question.includes("city")
  ) {
    const result = groupCount(rows, ["district", "area", "location", "station", "place", "city"]);
    if (result.length === 0) {
      return res.json({
        answer: "I could not find a district/area column in your uploaded data. Make sure your CSV has a column named 'district', 'area', 'location', or 'station'.",
        evidenceCards: [],
      });
    }
    const top = result[0];
    const summary = result.slice(0, 5).map(([n, c]) => `${n}: ${c}`).join(" · ");
    return res.json({
      answer: `**${top[0]}** has the highest record count with **${top[1]} cases**. Top 5 locations: ${summary}.`,
      evidenceCards: buildEvidenceCards(result, "District / Area"),
    });
  }

  // ── Query: crime type / category / offence ────────────────────────────────
  if (
    question.includes("crime") ||
    question.includes("type") ||
    question.includes("category") ||
    question.includes("offence") ||
    question.includes("offense") ||
    question.includes("section")
  ) {
    const result = groupCount(rows, ["crime_type", "crimetype", "crime type", "crime", "category", "offence", "offense", "section"]);
    if (result.length === 0) {
      return res.json({
        answer: "No crime type column found. Expected column names: 'crime_type', 'category', 'offence', or 'crime'.",
        evidenceCards: [],
      });
    }
    const top = result[0];
    const summary = result.slice(0, 5).map(([n, c]) => `${n}: ${c}`).join(" · ");
    return res.json({
      answer: `The most frequent crime type is **${top[0]}** with **${top[1]} incidents**. Full breakdown: ${summary}.`,
      evidenceCards: buildEvidenceCards(result, "Crime Type"),
    });
  }

  // ── Query: status / open / closed / pending ────────────────────────────────
  if (
    question.includes("status") ||
    question.includes("open") ||
    question.includes("closed") ||
    question.includes("pending") ||
    question.includes("solved") ||
    question.includes("active")
  ) {
    const result = groupCount(rows, ["status", "case_status", "case status", "casestatus"]);
    if (result.length === 0) {
      return res.json({
        answer: "No case status column found. Expected column names: 'status', 'case_status', or 'case status'.",
        evidenceCards: [],
      });
    }
    const summary = result.map(([n, c]) => `${n}: ${c}`).join(" · ");
    return res.json({
      answer: `Case status breakdown: ${summary}.`,
      evidenceCards: buildEvidenceCards(result, "Case Status"),
    });
  }

  // ── Query: date / when / year / month / time ──────────────────────────────
  if (
    question.includes("date") ||
    question.includes("when") ||
    question.includes("year") ||
    question.includes("month") ||
    question.includes("time") ||
    question.includes("recent")
  ) {
    const result = groupCount(rows, ["date", "datetime", "timestamp", "occurred", "reported", "year", "month"]);
    if (result.length === 0) {
      return res.json({
        answer: "No date column found in your data. Expected column names: 'date', 'timestamp', 'occurred', or 'reported'.",
        evidenceCards: [],
      });
    }
    const summary = result.slice(0, 5).map(([n, c]) => `${n}: ${c}`).join(" · ");
    return res.json({
      answer: `Date distribution (top 5): ${summary}.`,
      evidenceCards: buildEvidenceCards(result, "Date / Time"),
    });
  }

  // ── Query: suspect / accused / victim / person ────────────────────────────
  if (
    question.includes("suspect") ||
    question.includes("accused") ||
    question.includes("victim") ||
    question.includes("person") ||
    question.includes("name")
  ) {
    const result = groupCount(rows, ["accused", "suspect", "victim", "person", "name"]);
    if (result.length === 0) {
      return res.json({
        answer: "No person/name column found. Expected column names: 'accused', 'suspect', 'victim', or 'name'.",
        evidenceCards: [],
      });
    }
    const count = result.filter(([, c]) => c > 1).length;
    return res.json({
      answer: `Found **${result.length} unique names** in your records. **${count}** appear in more than one case (potential repeat offenders/victims).`,
      evidenceCards: buildEvidenceCards(result.filter(([, c]) => c > 1), "Person Reference"),
    });
  }

  // ── Query: columns / fields / what data ───────────────────────────────────
  if (
    question.includes("column") ||
    question.includes("field") ||
    question.includes("what data") ||
    question.includes("structure") ||
    question.includes("schema")
  ) {
    const allColumns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    return res.json({
      answer: `Your dataset has **${allColumns.length} columns**: ${allColumns.join(", ")}.`,
      evidenceCards: fileNames.map((fn) => {
        const table = latestTables.find((t) => t.fileName === fn);
        const cols = table ? [...new Set(table.rows.flatMap((r) => Object.keys(r)))] : [];
        return { title: fn, detail: `${cols.length} columns`, column: cols.join(", "), sources: [fn] };
      }),
    });
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  return res.json({
    answer:
      "I can answer questions about: **total records**, **districts/areas**, **crime types**, **case status**, **dates**, **suspects/victims**, and **data structure**. Try asking: 'Which district has the most cases?' or 'How many open cases are there?'",
    evidenceCards: [],
  });
});

// ── Dataset upload ────────────────────────────────────────────────────────────
app.post("/api/datasets/upload", upload.array("files", 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: "Choose one or more evidence files." });
    }

    const analysedFiles = [];
    for (const file of req.files) {
      analysedFiles.push(await analyseFile(file));
    }

    latestDatasets = analysedFiles.map((item) => item.summary);
    latestTables = analysedFiles
      .filter((item) => item.rows)
      .map((item) => ({
        fileName: item.summary.fileName,
        format: item.summary.format,
        rows: item.rows,
      }));
    latestDocuments = analysedFiles
      .filter((item) => !item.rows && item.text)
      .map((item) => ({ fileName: item.summary.fileName, text: item.text }));

    res.status(201).json({
      message: `${latestDatasets.length} evidence file(s) analysed successfully.`,
      datasets: latestDatasets,
    });
  } catch (error) {
    res.status(400).json({ message: error.message || "Could not analyse the selected files." });
  }
});

// ── Analytics profile ─────────────────────────────────────────────────────────
app.get("/api/analytics/profile", (req, res) => {
  if (latestDatasets.length === 0) {
    return res.status(404).json({ message: "Upload evidence files first." });
  }

  const tableProfiles = latestTables.map(profileTable);
  const mappings = tableProfiles.flatMap((table) =>
    table.columns.map((col) => ({
      fileName: table.fileName,
      column: col.name,
      suggestedAs: col.suggestedAs,
      confidence: col.confidence,
    }))
  );

  res.json({
    profile: {
      overall: {
        totalFiles: latestDatasets.length,
        tableFiles: latestTables.length,
        documentFiles: latestDatasets.filter((item) => item.kind === "document").length,
        totalRows: latestTables.reduce((sum, t) => sum + t.rows.length, 0),
      },
      datasets: tableProfiles,
      mappings,
    },
  });
});

// ── Analytics Network Graph ───────────────────────────────────────────────────
app.get("/api/analytics/network", (req, res) => {
  const nodesMap = new Map();
  const linksMap = new Map();

  function addNode(id, label, group, val = 1) {
    if (!id || String(id).trim() === "") return null;
    const cleanId = String(id).trim();
    if (!nodesMap.has(cleanId)) {
      nodesMap.set(cleanId, { id: cleanId, label: String(label).trim(), group, val });
    } else {
      nodesMap.get(cleanId).val += val; // increase node size based on frequency
    }
    return cleanId;
  }

  function addLink(source, target) {
    if (!source || !target || source === target) return;
    const linkId = `${source}---${target}`;
    const linkIdRev = `${target}---${source}`;
    if (!linksMap.has(linkId) && !linksMap.has(linkIdRev)) {
      linksMap.set(linkId, { source, target });
    }
  }

  let caseIndex = 1;

  for (const table of latestTables) {
    for (const row of table.rows) {
      let caseId = getValue(row, ["caseid", "caseno", "firno", "crimeid", "reportid", "id"]);
      if (!caseId) {
        caseId = `CASE-${caseIndex++}`;
      }

      const person = getValue(row, ["accused", "suspect", "victim", "person", "name"]);
      const location = getValue(row, ["district", "area", "location", "station", "place", "city"]);
      const crimeType = getValue(row, ["crime_type", "crimetype", "crime type", "crime", "category", "offence", "section"]);

      const caseNode = addNode(caseId, `Case: ${caseId}`, 1, 2);
      
      if (person) {
        const pNode = addNode(`PERSON-${person}`, person, 2, 1);
        addLink(caseNode, pNode);
      }
      if (location) {
        const lNode = addNode(`LOC-${location}`, location, 3, 1);
        addLink(caseNode, lNode);
      }
      if (crimeType) {
        const cNode = addNode(`CRIME-${crimeType}`, crimeType, 4, 1);
        addLink(caseNode, cNode);
      }
      
      // Also link person to location directly to show clusters
      if (person && location) {
        addLink(`PERSON-${person}`, `LOC-${location}`);
      }
    }
  }

  res.json({
    nodes: Array.from(nodesMap.values()),
    links: Array.from(linksMap.values())
  });
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    message: "CrimeLens API running",
    status: "success",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

// ── Production Setup (Serve Frontend) ─────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const clientDistPath = path.join(__dirname, "../client/dist");
  app.use(express.static(clientDistPath));

  app.get("*", (req, res) => {
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

app.listen(PORT, () => {
  console.log(`CrimeLens API running: http://localhost:${PORT}`);
});