"use client";

import { useEffect, useMemo, useState } from "react";
import { daysUntil } from "@/lib/csv/normalize";

interface ConsoleContract {
  id: string;
  vertragsnummer: string;
  produkt: string;
  versicherer: string;
  beginn: string | null;
  ablaufdatum: string | null;
  jahresbeitrag: number | null;
  zahlweise: string;
  status: string;
  makler: string;
  followUpErstellt: boolean;
  customer: { id: string | null; name: string; email: string | null; phone: string | null };
}

const WINDOWS = [30, 90, 180] as const;

type FollowupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; note?: string }
  | { kind: "error"; message: string };

export default function ContractsPage() {
  const [contracts, setContracts] = useState<ConsoleContract[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [makler, setMakler] = useState<string>("all");
  const [expiryWindow, setExpiryWindow] = useState<number | null>(90);
  const [followupState, setFollowupState] = useState<Record<string, FollowupState>>({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setError(null);
    try {
      const res = await fetch("/api/contracts", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Could not load contracts from Zoho.");
        return;
      }
      setContracts(data.contracts);
    } catch {
      setError("Could not reach the server.");
    }
  }

  const maklerOptions = useMemo(() => {
    if (!contracts) return [];
    return Array.from(new Set(contracts.map((c) => c.makler).filter(Boolean))).sort();
  }, [contracts]);

  const filtered = useMemo(() => {
    if (!contracts) return [];
    return contracts.filter((c) => {
      if (makler !== "all" && c.makler !== makler) return false;
      if (expiryWindow !== null) {
        if (!c.ablaufdatum) return false;
        const days = daysUntil(c.ablaufdatum);
        if (days > expiryWindow) return false;
      }
      return true;
    });
  }, [contracts, makler, expiryWindow]);

  async function createFollowup(contract: ConsoleContract) {
    setFollowupState((s) => ({ ...s, [contract.id]: { kind: "loading" } }));
    try {
      const res = await fetch(`/api/contracts/${contract.id}/followup`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setFollowupState((s) => ({
          ...s,
          [contract.id]: { kind: "error", message: data.error || "Failed to create follow-up." },
        }));
        return;
      }
      setContracts((prev) =>
        prev
          ? prev.map((c) => (c.id === contract.id ? { ...c, followUpErstellt: true } : c))
          : prev
      );
      setFollowupState((s) => ({
        ...s,
        [contract.id]: { kind: "done", note: data.ownerNote },
      }));
    } catch {
      setFollowupState((s) => ({
        ...s,
        [contract.id]: { kind: "error", message: "Request failed." },
      }));
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Contract console</h1>
        <button
          onClick={load}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100"
        >
          Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-neutral-600">Makler</label>
          <select
            value={makler}
            onChange={(e) => setMakler(e.target.value)}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="all">All</option>
            {maklerOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-600">Expiring within</span>
          <div className="flex gap-1">
            {WINDOWS.map((w) => (
              <button
                key={w}
                onClick={() => setExpiryWindow(w)}
                className={`rounded-md px-2.5 py-1 text-sm ${
                  expiryWindow === w
                    ? "bg-neutral-900 text-white"
                    : "border border-neutral-300 hover:bg-neutral-100"
                }`}
              >
                {w}d
              </button>
            ))}
            <button
              onClick={() => setExpiryWindow(null)}
              className={`rounded-md px-2.5 py-1 text-sm ${
                expiryWindow === null
                  ? "bg-neutral-900 text-white"
                  : "border border-neutral-300 hover:bg-neutral-100"
              }`}
            >
              All
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {!contracts && !error && <p className="mt-6 text-sm text-neutral-500">Loading contracts from Zoho…</p>}
      {contracts && filtered.length === 0 && !error && (
        <p className="mt-6 text-sm text-neutral-500">No contracts match these filters.</p>
      )}

      {contracts && filtered.length > 0 && (
        <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs font-medium uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-3 py-2">Contract</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2">Expiry</th>
                <th className="px-3 py-2">Premium</th>
                <th className="px-3 py-2">Makler</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Follow-up</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((c) => (
                <ContractRow
                  key={c.id}
                  contract={c}
                  followupState={followupState[c.id] ?? { kind: "idle" }}
                  onCreateFollowup={() => createFollowup(c)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function urgency(ablaufdatum: string | null, status: string) {
  if (status === "Gekündigt") return { label: "cancelled", classes: "bg-neutral-100 text-neutral-500" };
  if (!ablaufdatum) return { label: "unknown", classes: "bg-neutral-100 text-neutral-500" };
  const days = daysUntil(ablaufdatum);
  if (days < 0) return { label: `expired ${Math.abs(days)}d ago`, classes: "bg-red-600 text-white" };
  if (days <= 30) return { label: `${days}d left`, classes: "bg-red-100 text-red-800" };
  if (days <= 90) return { label: `${days}d left`, classes: "bg-amber-100 text-amber-800" };
  if (days <= 180) return { label: `${days}d left`, classes: "bg-yellow-50 text-yellow-800" };
  return { label: `${days}d left`, classes: "bg-neutral-100 text-neutral-600" };
}

function ContractRow({
  contract,
  followupState,
  onCreateFollowup,
}: {
  contract: ConsoleContract;
  followupState: FollowupState;
  onCreateFollowup: () => void;
}) {
  const u = urgency(contract.ablaufdatum, contract.status);
  const canCreate = contract.status !== "Gekündigt" && !contract.followUpErstellt;

  return (
    <tr className="align-top">
      <td className="px-3 py-2 font-mono text-xs">{contract.vertragsnummer}</td>
      <td className="px-3 py-2">
        <div className="font-medium">{contract.customer.name}</div>
        <div className="text-xs text-neutral-500">{contract.customer.email}</div>
        <div className="text-xs text-neutral-500">{contract.customer.phone}</div>
      </td>
      <td className="px-3 py-2">
        <div>{contract.produkt}</div>
        <div className="text-xs text-neutral-500">{contract.versicherer}</div>
      </td>
      <td className="px-3 py-2">
        <div>{contract.ablaufdatum}</div>
        <span className={`mt-1 inline-block rounded px-1.5 py-0.5 text-xs font-medium ${u.classes}`}>
          {u.label}
        </span>
      </td>
      <td className="px-3 py-2">
        {contract.jahresbeitrag != null ? `€${contract.jahresbeitrag.toFixed(2)}` : "—"}
        <div className="text-xs text-neutral-500">{contract.zahlweise}</div>
      </td>
      <td className="px-3 py-2">{contract.makler}</td>
      <td className="px-3 py-2">{contract.status}</td>
      <td className="px-3 py-2">
        {contract.followUpErstellt ? (
          <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-800">
            follow-up created
          </span>
        ) : (
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-600">
            none yet
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        {canCreate && (
          <button
            onClick={onCreateFollowup}
            disabled={followupState.kind === "loading"}
            className="rounded-md bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 disabled:opacity-50"
          >
            {followupState.kind === "loading" ? "Creating…" : "Create follow-up"}
          </button>
        )}
        {followupState.kind === "error" && (
          <p className="mt-1 max-w-[180px] text-xs text-red-600">{followupState.message}</p>
        )}
        {followupState.kind === "done" && followupState.note && (
          <p className="mt-1 max-w-[180px] text-xs text-amber-600">{followupState.note}</p>
        )}
      </td>
    </tr>
  );
}
