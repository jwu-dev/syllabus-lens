import { extractText, getDocumentProxy } from "unpdf";

export async function extractPdfText(
  pdfBytes: Uint8Array
): Promise<{ text: string; pageCount: number }> {
  const pdf = await getDocumentProxy(new Uint8Array(pdfBytes));
  const result = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(result.text) ? result.text : [String(result.text ?? "")];
  const joined = pages.join("\n\n");
  return {
    text: joined,
    pageCount: result.totalPages ?? pages.length,
  };
}
