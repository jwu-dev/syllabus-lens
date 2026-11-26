import { NextResponse } from "next/server";
import { extractSyllabusHybrid } from "@/lib/ai-extractor";
import { extractPdfLayout, type PdfLayoutDocument } from "@/lib/pdf";
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
      rawProvider === "gemini" ||
      rawProvider === "openai" ||
      rawProvider === "ollama" ||
      rawProvider === "local"
        ? rawProvider
        : "auto";

    const apiKey = String(formData.get("apiKey") || "").trim() || undefined;
    const model = String(formData.get("model") || "").trim() || undefined;
    const ollamaBaseUrl = String(formData.get("ollamaBaseUrl") || "").trim() || undefined;

    const arrayBuffer = await file.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);

    const header = Buffer.from(pdfBytes.slice(0, 5)).toString("ascii");
    if (header !== "%PDF-") {
      return NextResponse.json(
        { error: "The uploaded file does not appear to be a valid PDF document." },
        { status: 400 }
      );
    }

    let layout: PdfLayoutDocument | undefined;
    let rawText = "";
    let pageCount = 0;

    try {
      layout = await extractPdfLayout(pdfBytes);
      rawText = layout.text;
      pageCount = layout.pageCount;
    } catch (pdfErr) {
      console.error("PDF layout extraction error:", pdfErr);
      if (provider === "local" || provider === "ollama") {
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
      layout,
      rawText,
      pageCount,
      provider,
      apiKey,
      model,
      ollamaBaseUrl,
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
