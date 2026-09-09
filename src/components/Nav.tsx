import Link from "next/link";

export function Nav() {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-semibold text-neutral-900">
          Brandovise CRM Console
        </Link>
        <nav className="flex gap-4 text-sm">
          <Link href="/contracts" className="text-neutral-600 hover:text-neutral-900">
            Contracts
          </Link>
          <Link href="/import" className="text-neutral-600 hover:text-neutral-900">
            Import
          </Link>
        </nav>
      </div>
    </header>
  );
}
