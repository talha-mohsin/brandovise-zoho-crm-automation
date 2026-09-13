"use client";

import { useState } from "react";

interface DataIssue {
  severity: "error" | "warning";
  source: "kontakte" | "vertraege";
  row: number;
  identifier: string;
  message: string;
}

interface PreviewResponse {
  ok: boolean;
  error?: string;
  counts: {
    customersRead: number;
    customersToImport: number;
    contractsRead: number;
    contractsToImport: number;
  };
  issues: DataIssue[];
  skippedCustomers: { row: number; kundennummer: string; reason: string }[];
  skippedContracts: { row: number; vertragsnummer: string; reason: string }[];
}

interface CommitItemResult {
  identifier: string;
  action: "created" | "updated" | "skipped" | "failed";
  reason?: string;
}

interface CommitResponse {
  ok: boolean;
  error?: string;
  counts: PreviewResponse["counts"];
  customers: CommitItemResult[];
  contracts: CommitItemResult[];
  skippedDuringValidation: CommitItemResult[];
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(file, "utf-8");
  });
}

export default function ImportPage() {
  const [kontakteFile, setKontakteFile] = useState<File | null>(null);
  const [vertraegeFile, setVertraegeFile] = useState<File | null>(null);
  const [source, setSource] = useState<"upload" | "sample" | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [csvPayload, setCsvPayload] = useState<{ kontakteCsv: string; vertraegeCsv: string } | null>(null);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<CommitResponse | null>(null);

  async function runPreview(useSample: boolean) {
    setError(null);
    setLoading(true);
    setPreview(null);
    setResult(null);
    try {
      let payload: { kontakteCsv?: string; vertraegeCsv?: string; useSample?: boolean };
      if (useSample) {
        payload = { useSample: true };
        setSource("sample");
      } else {
        if (!kontakteFile || !vertraegeFile) {
          setError("Please choose both CSV files.");
          setLoading(false);
          return;
        }
        const [kontakteCsv, vertraegeCsv] = await Promise.all([
          readFileAsText(kontakteFile),
          readFileAsText(vertraegeFile),
        ]);
        payload = { kontakteCsv, vertraegeCsv };
        setSource("upload");
      }

      const res = await fetch("/api/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: PreviewResponse = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Preview failed.");
        return;
      }
      setPreview(data);
      if (useSample) {
        // Re-fetch the same sample text so commit sends identical bytes.
        setCsvPayload(null);
      } else if (payload.kontakteCsv && payload.vertraegeCsv) {
        setCsvPayload({ kontakteCsv: payload.kontakteCsv, vertraegeCsv: payload.vertraegeCsv });
      }
    } catch {
      setError("Could not read or parse the files.");
    } finally {
      setLoading(false);
    }
  }

  async function runCommit() {
    setCommitting(true);
    setError(null);
    try {
      const payload = source === "sample" || !csvPayload ? { useSample: true } : csvPayload;
      const res = await fetch("/api/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: CommitResponse = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Import failed.");
        return;
      }
      setResult(data);
    } catch {
      setError("Import request failed.");
    } finally {
      setCommitting(false);
    }
  }

  const errors = preview?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = preview?.issues.filter((i) => i.severity === "warning") ?? [];

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-xl font-semibold text-slate-900">Import customers &amp; contracts</h1>
      <p className="mt-1 text-sm text-slate-600">
        Nothing is written to Zoho until you review the preview and confirm.
      </p>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-medium text-slate-900">1. Choose your data</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-slate-500">kontakte_export.csv</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setKontakteFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500">vertraege_export.csv</label>
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setVertraegeFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full rounded-md border border-slate-200 bg-white text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
            />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => runPreview(false)}
            disabled={loading}
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500 disabled:opacity-50"
          >
            Preview uploaded files
          </button>
          <button
            onClick={() => runPreview(true)}
            disabled={loading}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100 disabled:opacity-50"
          >
            Or use the sample files from the repo
          </button>
        </div>
        {loading && <p className="mt-3 text-sm text-slate-500">Reading and validating…</p>}
        {error && (
          <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>

      {preview && (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-medium text-slate-900">2. Preview</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Customers read" value={preview.counts.customersRead} />
            <Stat label="Customers to import" value={preview.counts.customersToImport} />
            <Stat label="Contracts read" value={preview.counts.contractsRead} />
            <Stat label="Contracts to import" value={preview.counts.contractsToImport} />
          </div>

          {errors.length > 0 && (
            <IssueList title={`Problems that block a row (${errors.length})`} issues={errors} tone="error" />
          )}
          {warnings.length > 0 && (
            <IssueList title={`Worth a look, imported anyway (${warnings.length})`} issues={warnings} tone="warning" />
          )}
          {errors.length === 0 && warnings.length === 0 && (
            <p className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
              No data problems found.
            </p>
          )}

          <div className="mt-5">
            <button
              onClick={runCommit}
              disabled={committing}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {committing ? "Writing to Zoho…" : "Confirm & import into Zoho"}
            </button>
            <p className="mt-2 text-xs text-slate-500">
              Records are matched on Kundennummer / Vertragsnummer, so running this again updates
              existing records instead of duplicating them.
            </p>
          </div>
        </section>
      )}

      {result && (
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-medium text-slate-900">3. Result</h2>
          <ResultTable title="Customers" items={result.customers} />
          <ResultTable title="Contracts" items={result.contracts} />
          {result.skippedDuringValidation.length > 0 && (
            <ResultTable title="Skipped before reaching Zoho" items={result.skippedDuringValidation} />
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function IssueList({
  title,
  issues,
  tone,
}: {
  title: string;
  issues: DataIssue[];
  tone: "error" | "warning";
}) {
  const toneClasses =
    tone === "error"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-amber-200 bg-amber-50 text-amber-800";
  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="mt-2 space-y-2">
        {issues.map((issue, i) => (
          <li key={i} className={`rounded-md border px-3 py-2 text-sm ${toneClasses}`}>
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultTable({ title, items }: { title: string; items: CommitItemResult[] }) {
  const badge: Record<CommitItemResult["action"], string> = {
    created: "bg-green-100 text-green-800",
    updated: "bg-blue-100 text-blue-800",
    skipped: "bg-slate-200 text-slate-700",
    failed: "bg-red-100 text-red-800",
  };
  return (
    <div className="mt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {title} ({items.length})
      </h3>
      <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-sm">
        {items.map((item, i) => (
          <li key={i} className="flex items-center gap-2 text-slate-700">
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${badge[item.action]}`}>
              {item.action}
            </span>
            <span className="font-mono text-xs">{item.identifier}</span>
            {item.reason && <span className="text-xs text-slate-500">— {item.reason}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
