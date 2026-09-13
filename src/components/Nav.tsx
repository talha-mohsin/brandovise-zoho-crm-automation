import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b border-slate-200 bg-white shadow-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-semibold text-slate-900">
          Brandovise CRM Console
        </Link>
        <nav className="flex gap-2 text-sm">
          <Link
            href="/contracts"
            className="rounded-md px-3 py-1.5 font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            Contracts
          </Link>
          <Link
            href="/import"
            className="rounded-md px-3 py-1.5 font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            Import
          </Link>
        </nav>
      </div>
    </header>
  );
}
