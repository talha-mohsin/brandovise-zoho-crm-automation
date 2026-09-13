import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold text-slate-900">Brandovise CRM Console</h1>
      <p className="mt-2 text-slate-600">
        A small operator UI on top of Zoho CRM: import customers and contracts
        from the broker&apos;s CSV exports, then work renewals from one screen.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/import"
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-500"
        >
          1. Import data
        </Link>
        <Link
          href="/contracts"
          className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-100"
        >
          2. Open contract console
        </Link>
      </div>
    </div>
  );
}
