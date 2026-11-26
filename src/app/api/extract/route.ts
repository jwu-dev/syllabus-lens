import { NextResponse } from "next/server";
import { extractSyllabusHybrid } from "@/lib/ai-extractor";
import { extractPdfText } from "@/lib/pdf";
import type { ExtractionProvider } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Please upload a PDF file under the 'file' field." },
        { status: 400 }
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "The uploaded file is empty." }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "PDF exceeds the 20 MB upload limit." },
        { status: 413 }
      );
    }

    const fileName = file.name || "course-outline.pdf";
    const isPdf =
      file.type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json(
        { error: "Only PDF files (.pdf) are supported." },
        { status: 400 }
      );
    }

    const rawProvider = String(formData.get("provider") || "auto").toLowerCase();
    const provider: ExtractionProvider =
      rawProvider === "gemini" || rawProvider === "openai" || rawProvider === "local"
        ? rawProvider
        : "auto";

    const apiKey = String(formData.get("apiKey") || "").trim() || undefined;
    const model = String(formData.get("model") || "").trim() || undefined;

    const arrayBuffer = await file.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);

    // Quick PDF header magic check (%PDF-)
    const header = Buffer.from(pdfBytes.slice(0, 5)).toString("ascii");
    if (header !== "%PDF-") {
      return NextResponse.json(
        { error: "The uploaded file does not appear to be a valid PDF document." },
        { status: 400 }
      );
    }

    let rawText = "";
    let pageCount = 0;

    try {
      const extracted = await extractPdfText(pdfBytes);
      rawText = extracted.text;
      pageCount = extracted.pageCount;
    } catch (pdfErr) {
      console.error("PDF text extraction error:", pdfErr);
      // Still allow Gemini native PDF processing if configured
      if (provider === "local") {
        return NextResponse.json(
          {
            error:
              "Could not parse text from this PDF. It may be corrupted, encrypted, or password-protected.",
          },
          { status: 422 }
        );
      }
    }

    const syllabus = await extractSyllabusHybrid({
      pdfBytes,
      rawText,
      pageCount,
      provider,
      apiKey,
      model,
    });

    return NextResponse.json({
      fileName,
      syllabus,
    });
  } catch (err) {
    console.error("Extraction endpoint failed:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred while extracting the syllabus.",
      },
      { status: 500 }
    );
  }
}
