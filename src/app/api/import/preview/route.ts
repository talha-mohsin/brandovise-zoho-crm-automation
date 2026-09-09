import { NextResponse } from "next/server";
import { parseImportData } from "@/lib/csv/parse";
import { readSampleCsvs } from "@/lib/csv/sample";

export const runtime = "nodejs";

interface PreviewRequestBody {
  kontakteCsv?: string;
  vertraegeCsv?: string;
  useSample?: boolean;
}

export async function POST(req: Request) {
  const body = (await req.json()) as PreviewRequestBody;

  let kontakteCsv = body.kontakteCsv;
  let vertraegeCsv = body.vertraegeCsv;

  if (body.useSample || !kontakteCsv || !vertraegeCsv) {
    const sample = readSampleCsvs();
    kontakteCsv ??= sample.kontakteCsv;
    vertraegeCsv ??= sample.vertraegeCsv;
  }

  try {
    const parsed = parseImportData(kontakteCsv, vertraegeCsv);
    return NextResponse.json({ ok: true, ...parsed });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Parse failed" },
      { status: 400 }
    );
  }
}
