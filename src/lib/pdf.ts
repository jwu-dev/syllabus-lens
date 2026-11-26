import { getDocumentProxy } from "unpdf";

export interface PdfSpan {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontName: string;
  isBold: boolean;
}

export interface PdfVisualLine {
  page: number;
  y: number;
  x: number;
  fontSize: number;
  isBold: boolean;
  /** Reconstructed line text */
  text: string;
  /** Column-separated cells when a visual table row has large horizontal gaps */
  cells: string[];
  /** True when typography (larger font or standalone bold) signals a section heading */
  isHeading: boolean;
  gapAbove: number;
}

export interface PdfLayoutBlock {
  page: number;
  kind: "heading" | "table_row" | "list_item" | "paragraph";
  text: string;
  cells: string[];
  fontSize: number;
  isBold: boolean;
}

export interface PdfLayoutDocument {
  pageCount: number;
  bodyFontSize: number;
  lines: PdfVisualLine[];
  blocks: PdfLayoutBlock[];
  /** Layout-preserving plain text (tables kept on one line, paragraphs cleanly unwrapped) */
  text: string;
}

interface RawPdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  fontName?: string;
}

function isBoldFont(fontName: string, fontFamily?: string): boolean {
  const combined = `${fontName} ${fontFamily ?? ""}`;
  return /bold|black|heavy|semibold|demi|bd\b|bx\b/i.test(combined);
}

function computeBodyFontSize(lines: Array<{ fontSize: number; text: string }>): number {
  const counts = new Map<number, number>();
  for (const line of lines) {
    const rounded = Math.round(line.fontSize * 2) / 2;
    if (rounded <= 0) continue;
    counts.set(rounded, (counts.get(rounded) ?? 0) + line.text.length);
  }
  let bestSize = 10.5;
  let bestWeight = -1;
  for (const [size, weight] of counts.entries()) {
    if (weight > bestWeight) {
      bestWeight = weight;
      bestSize = size;
    }
  }
  return bestSize;
}

function isBulletLine(text: string): boolean {
  return /^(?:[-•*▪◦‣]|\[\d+\]|\d+[.)])\s+/.test(text.trim());
}

/**
 * Pure layout reconstruction from positioned PDF text spans.
 * Exported separately so it can be unit-tested deterministically without needing binary PDFs.
 */
export function buildLayoutDocumentFromPages(
  pages: PdfSpan[][],
  pageCount: number
): PdfLayoutDocument {
  const rawLines: Array<Omit<PdfVisualLine, "isHeading">> = [];

  for (let p = 0; p < pages.length; p++) {
    const pageNum = p + 1;
    const spans = pages[p].filter((s) => s.text.trim().length > 0);
    if (spans.length === 0) continue;

    // Sort top-to-bottom (y descending), then left-to-right (x ascending)
    const sorted = [...spans].sort((a, b) => {
      if (Math.abs(b.y - a.y) > 2.5) return b.y - a.y;
      return a.x - b.x;
    });

    // Cluster spans sharing the same baseline into visual rows
    const rowBuckets: PdfSpan[][] = [];
    for (const span of sorted) {
      const tolerance = Math.max(2.5, span.fontSize * 0.42);
      const bucket = rowBuckets.find(
        (b) => Math.abs(b[0].y - span.y) <= tolerance
      );
      if (bucket) {
        bucket.push(span);
      } else {
        rowBuckets.push([span]);
      }
    }

    // Sort buckets top-to-bottom by average y
    rowBuckets.sort((a, b) => b[0].y - a[0].y);

    let prevY: number | null = null;
    for (const bucket of rowBuckets) {
      bucket.sort((a, b) => a.x - b.x);

      const cells: string[] = [];
      let currentCell = "";
      let totalChars = 0;
      let boldChars = 0;
      let weightedFontSize = 0;

      for (let i = 0; i < bucket.length; i++) {
        const span = bucket[i];
        const prev = bucket[i - 1];
        const cleanStr = span.text.replace(/\u00A0/g, " ");
        const charCount = cleanStr.trim().length;

        totalChars += charCount;
        weightedFontSize += span.fontSize * Math.max(1, charCount);
        if (span.isBold) boldChars += charCount;

        if (!prev) {
          currentCell = cleanStr;
          continue;
        }

        const prevRight = prev.x + Math.max(0, prev.width);
        const gap = span.x - prevRight;
        const avgFs = Math.max(6, (prev.fontSize + span.fontSize) / 2);

        // Large horizontal gap => distinct table column cell
        if (gap >= avgFs * 1.9) {
          if (currentCell.trim()) cells.push(currentCell.trim().replace(/\s+/g, " "));
          currentCell = cleanStr;
        } else if (
          gap >= avgFs * 0.16 &&
          !currentCell.endsWith(" ") &&
          !cleanStr.startsWith(" ")
        ) {
          currentCell += " " + cleanStr;
        } else {
          currentCell += cleanStr;
        }
      }

      if (currentCell.trim()) {
        cells.push(currentCell.trim().replace(/\s+/g, " "));
      }

      if (cells.length === 0) continue;

      const avgFontSize =
        totalChars > 0 ? weightedFontSize / totalChars : bucket[0].fontSize;
      const lineY = bucket[0].y;
      const gapAbove = prevY !== null ? Math.max(0, prevY - lineY) : avgFontSize * 2;
      prevY = lineY;

      const text =
        cells.length >= 2
          ? cells.join("  |  ")
          : cells[0];

      rawLines.push({
        page: pageNum,
        y: lineY,
        x: bucket[0].x,
        fontSize: Math.round(avgFontSize * 10) / 10,
        isBold: totalChars > 0 ? boldChars / totalChars >= 0.7 : bucket[0].isBold,
        text,
        cells,
        gapAbove,
      });
    }
  }

  const bodyFontSize = computeBodyFontSize(rawLines);

  // Classify visual headings purely from typography & layout
  const lines: PdfVisualLine[] = rawLines.map((line) => {
    const trimmed = line.text.trim();
    const isShort = trimmed.length >= 2 && trimmed.length <= 85;
    const endsSentence = /\.\s*$/.test(trimmed) && !/\b(?:ed|vol|no|dr|prof)\.$/i.test(trimmed);
    const isUrl = /^(?:https?:\/\/|www\.)/i.test(trimmed);
    const isLargerFont = line.fontSize >= bodyFontSize * 1.12;
    const isStandaloneBoldHeading =
      line.isBold &&
      line.cells.length === 1 &&
      !isBulletLine(trimmed) &&
      !endsSentence &&
      !/@/.test(trimmed) &&
      !/\d+%/.test(trimmed) &&
      (line.gapAbove >= bodyFontSize * 1.35 || trimmed.length <= 45);

    const isHeading =
      isShort &&
      !isUrl &&
      !endsSentence &&
      line.cells.length === 1 &&
      (isLargerFont || isStandaloneBoldHeading);

    return {
      ...line,
      isHeading,
    };
  });

  // Reflow wrapped visual lines into semantic layout blocks
  const blocks: PdfLayoutBlock[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.text.trim();

    if (line.isHeading) {
      blocks.push({
        page: line.page,
        kind: "heading",
        text: trimmed,
        cells: line.cells,
        fontSize: line.fontSize,
        isBold: line.isBold,
      });
      continue;
    }

    if (line.cells.length >= 2) {
      blocks.push({
        page: line.page,
        kind: "table_row",
        text: trimmed,
        cells: line.cells,
        fontSize: line.fontSize,
        isBold: line.isBold,
      });
      continue;
    }

    const prevLine = lines[i - 1];
    const prevBlock = blocks[blocks.length - 1];

    const samePage = prevLine && prevLine.page === line.page;
    const tightVerticalGap =
      samePage && line.gapAbove <= Math.max(bodyFontSize * 1.65, line.fontSize * 1.65);
    const similarLeftMargin = samePage && Math.abs(line.x - prevLine.x) <= 24;
    const startsNewListItem = isBulletLine(trimmed);
    const isUrl = /^(?:https?:\/\/|www\.)/i.test(trimmed);
    const prevIsUrl = prevBlock && /^(?:https?:\/\/|www\.)/i.test(prevBlock.text);
    const startsKeyValueLabel = /^[A-Z][A-Za-z\s/()-]{1,28}:\s+\S/.test(trimmed);
    const endsColon = /:\s*$/.test(trimmed) && trimmed.length <= 70;
    const prevEndsColon = prevBlock ? /:\s*$/.test(prevBlock.text) : false;
    const prevEndedCleanly = prevBlock ? /[.!?]\s*$/.test(prevBlock.text) : false;
    const prevEndsCompleteCitation = prevBlock
      ? /(?:\bEd(?:ition)?\.?\s*\d+(?:\.\d+)?|\b(?:19|20)\d{2}\)?\.?|\bISBN[\s:-]*[0-9Xx-]{10,17}|\b\d{1,3}%)\s*$/i.test(
          prevBlock.text
        )
      : false;
    const startsContinuationFragment =
      /^(?:[a-z]|ISBN\b|Ed(?:ition)?\.?\s*\d|\d+(?:st|nd|rd|th)\s+ed)/i.test(trimmed);

    const canReflow =
      Boolean(prevBlock) &&
      (prevBlock.kind === "paragraph" || prevBlock.kind === "list_item") &&
      samePage &&
      tightVerticalGap &&
      !startsNewListItem &&
      !isUrl &&
      !prevIsUrl &&
      !startsKeyValueLabel &&
      !endsColon &&
      !prevEndsColon &&
      (!prevEndsCompleteCitation || startsContinuationFragment) &&
      (similarLeftMargin || !prevEndedCleanly);

    if (canReflow && prevBlock) {
      // De-hyphenate word splits across line breaks ("asymptot-" + "ic" -> "asymptotic")
      if (/[a-z]-\s*$/.test(prevBlock.text) && /^[a-z]/.test(trimmed)) {
        prevBlock.text = `${prevBlock.text.replace(/-\s*$/, "")}${trimmed}`;
      } else if (
        // Join mid-word break when PDF wraps without hyphen ("will be pos" + "ted")
        /\b[a-z]{2,4}$/.test(prevBlock.text) &&
        /^[a-z]{2,}/.test(trimmed) &&
        prevLine &&
        prevLine.text.length >= 60 &&
        !/\b(?:and|the|for|are|was|not|but|can|all|any|our|out|use|has|had|its|may|you|who|how|one|two|see|via|per)\b$/i.test(
          prevBlock.text
        )
      ) {
        prevBlock.text = `${prevBlock.text}${trimmed}`;
      } else {
        prevBlock.text = `${prevBlock.text} ${trimmed}`.replace(/\s{2,}/g, " ");
      }
      prevBlock.cells = [prevBlock.text];
      continue;
    }

    blocks.push({
      page: line.page,
      kind: startsNewListItem ? "list_item" : "paragraph",
      text: trimmed,
      cells: line.cells,
      fontSize: line.fontSize,
      isBold: line.isBold,
    });
  }

  // Produce clean layout-preserved text for LLM consumption & raw text preview
  const text = blocks
    .map((b) => {
      if (b.kind === "heading") return `\n## ${b.text}`;
      if (b.kind === "table_row") return b.cells.join(" | ");
      return b.text;
    })
    .join("\n")
    .replace(/^\n+/, "");

  return {
    pageCount,
    bodyFontSize,
    lines,
    blocks,
    text,
  };
}

export async function extractPdfLayout(pdfBytes: Uint8Array): Promise<PdfLayoutDocument> {
  const pdf = await getDocumentProxy(new Uint8Array(pdfBytes));
  const pages: PdfSpan[][] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const styles = (content.styles ?? {}) as Record<string, { fontFamily?: string }>;
    const spans: PdfSpan[] = [];

    for (const rawItem of content.items as RawPdfTextItem[]) {
      if (!rawItem.str || !rawItem.str.trim()) continue;
      const transform = rawItem.transform ?? [10, 0, 0, 10, 0, 0];
      const fontSize =
        Math.hypot(transform[0] ?? 0, transform[1] ?? 0) || rawItem.height || 10;
      const fontName = rawItem.fontName ?? "";
      const fontFamily = styles[fontName]?.fontFamily;

      spans.push({
        text: rawItem.str,
        x: transform[4] ?? 0,
        y: transform[5] ?? 0,
        width: rawItem.width ?? 0,
        fontSize,
        fontName,
        isBold: isBoldFont(fontName, fontFamily),
      });
    }

    pages.push(spans);
  }

  return buildLayoutDocumentFromPages(pages, pdf.numPages);
}

/** Convenience wrapper returning flat layout-preserved text and page count */
export async function extractPdfText(
  pdfBytes: Uint8Array
): Promise<{ text: string; pageCount: number }> {
  const layout = await extractPdfLayout(pdfBytes);
  return {
    text: layout.text,
    pageCount: layout.pageCount,
  };
}
