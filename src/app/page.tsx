import Link from "next/link";

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-2xl font-semibold">Brandovise CRM Console</h1>
      <p className="mt-2 text-neutral-600">
        A small operator UI on top of Zoho CRM: import customers and contracts
        from the broker&apos;s CSV exports, then work renewals from one screen.
      </p>
      <div className="mt-8 flex gap-4">
        <Link
          href="/import"
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
        >
          1. Import data
        </Link>
        <Link
          href="/contracts"
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100"
        >
          2. Open contract console
        </Link>
      </div>
    </div>
  );
}
