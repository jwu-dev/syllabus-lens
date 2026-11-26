import type { PdfLayoutBlock, PdfLayoutDocument } from "./pdf";
import { normalizeExtractedSyllabus } from "./schema";
import type { ExtractedSyllabus } from "./types";

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function normalizeDateToIso(raw: string, fallbackYear: number): string {
  const trimmed = raw.trim();

  const iso = trimmed.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${pad2(Number(iso[2]))}-${pad2(Number(iso[3]))}`;
  }

  const named = trimmed.match(
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(20\d{2}))?\b/i
  );
  if (named) {
    const month = MONTHS[named[1].toLowerCase().replace(/\.$/, "")];
    const day = Number(named[2]);
    const year = named[3] ? Number(named[3]) : fallbackYear;
    if (month && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  const dayFirst = trimmed.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?(?:,?\s*(20\d{2}))?\b/i
  );
  if (dayFirst) {
    const day = Number(dayFirst[1]);
    const month = MONTHS[dayFirst[2].toLowerCase().replace(/\.$/, "")];
    const year = dayFirst[3] ? Number(dayFirst[3]) : fallbackYear;
    if (month && day >= 1 && day <= 31) {
      return `${year}-${pad2(month)}-${pad2(day)}`;
    }
  }

  const slash = trimmed.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slash) {
    return `${slash[3]}-${pad2(Number(slash[1]))}-${pad2(Number(slash[2]))}`;
  }

  return trimmed;
}

type SectionKey =
  | "header"
  | "instructor"
  | "exams"
  | "textbooks"
  | "exercises"
  | "grading"
  | "other";

function isTextbookSubheading(text: string): "required" | "suggested" | null {
  const cleaned = text.replace(/[:\-–—]+$/, "").trim();
  if (/^(?:required|mandatory|primary|course)\s+(?:textbooks?|books?|readings?|materials?)$/i.test(cleaned)) {
    return "required";
  }
  if (
    /^(?:(?:suggested|recommended|optional|supplementary|additional|reference)\s+(?:textbooks?|books?|readings?|references?|materials?)|references?)$/i.test(
      cleaned
    )
  ) {
    return "suggested";
  }
  return null;
}

function classifyHeadingText(rawText: string): SectionKey | null {
  const normalized = rawText
    .replace(/^(?:section\s+)?(?:\d+(?:\.\d+)*|[IVX]+)[.):\-]?\s+/i, "")
    .replace(/[:\-–—]+$/, "")
    .trim();

  if (!normalized) return null;

  if (/^(?:instructor(?:\s+information)?|professor|course\s+staff|teaching\s+team|contact\s+information)$/i.test(normalized)) {
    return "instructor";
  }
  if (/^(?:grading(?:\s+scheme|\s+breakdown|\s+policy|\s+system)?|evaluation(?:\s+scheme|\s+breakdown|\s+and\s+grading)?|assessment(?:\s+scheme|\s+and\s+grading)?|marking\s+scheme|course\s+grades?|grade\s+distribution|course\s+evaluation|weights?)$/i.test(normalized)) {
    return "grading";
  }
  if (/^(?:exam(?:s|\s+dates|\s+schedule)?|examinations?|important\s+dates|key\s+dates|test\s+dates|midterm\s+and\s+final(?:\s+exams?)?)$/i.test(normalized)) {
    return "exams";
  }
  if (/^(?:(?:required\s+(?:and|&|\/)\s+)?(?:suggested|recommended|optional|reference)?\s*textbooks?|course\s+textbooks?|course\s+materials?|required\s+readings?|readings?\s+(?:and|&)\s+textbooks?|textbooks?\s+(?:and|&)\s+references?|references?)$/i.test(normalized)) {
    return "textbooks";
  }
  if (/^(?:suggested\s+exercises?|practice\s+problems?|recommended\s+(?:exercises?|problems?)|homework\s+problems?|exercises?\s+(?:and|&)\s+problems?|problem\s+sets?)$/i.test(normalized)) {
    return "exercises";
  }
  if (/^(?:course\s+(?:description|content|topics|outline|overview|objectives|outcomes|policies|schedule|calendar)|calendar\s+description|learning\s+(?:outcomes|objectives)|weekly\s+schedule|lecture\s+schedule|topics?(?:\s+covered)?|academic\s+integrity|accommodations?|university\s+policies|policies|prerequisites?|late\s+policy|attendance)$/i.test(normalized)) {
    return "other";
  }

  return null;
}

function splitBlocksIntoSections(blocks: PdfLayoutBlock[]): Record<SectionKey, PdfLayoutBlock[]> {
  const sections: Record<SectionKey, PdfLayoutBlock[]> = {
    header: [],
    instructor: [],
    exams: [],
    textbooks: [],
    exercises: [],
    grading: [],
    other: [],
  };

  let current: SectionKey = "header";

  for (const block of blocks) {
    const text = block.text.trim();
    if (!text) continue;

    // Keep Required / Suggested subheadings inside the textbooks section so they update requirement status
    if (current === "textbooks" && isTextbookSubheading(text)) {
      sections.textbooks.push(block);
      continue;
    }

    // 1. Typographical heading (detected from font size / bold weight by the PDF layout engine)
    if (block.kind === "heading") {
      const classified = classifyHeadingText(text);
      if (classified) {
        current = classified;
        continue;
      }
      // Keep top-of-document title/header lines in "header"; elsewhere any visual heading starts "other"
      if (current === "header" && sections.header.length < 6) {
        sections.header.push(block);
      } else {
        current = "other";
      }
      continue;
    }

    // 2. Text-only heading fallback (when parsing plain text without PDF font metadata)
    if (block.cells.length === 1 && text.length <= 85 && !/\.\s*$/.test(text) && !/^https?:\/\//i.test(text)) {
      const classified = classifyHeadingText(text);
      if (classified) {
        current = classified;
        continue;
      }

      // Generic numbered or ALL-CAPS short heading transitions out of narrow sections
      if (current !== "header" && current !== "other") {
        const hasNumbering = /^(?:section\s+)?(?:\d+(?:\.\d+)*|[IVX]+)[.):\-]\s+/i.test(text);
        const normalized = text
          .replace(/^(?:section\s+)?(?:\d+(?:\.\d+)*|[IVX]+)[.):\-]?\s+/i, "")
          .replace(/[:\-–—]+$/, "")
          .trim();

        const isAllCaps =
          normalized.length >= 4 &&
          normalized.length <= 45 &&
          /^[A-Z0-9\s&/,-]+$/.test(normalized) &&
          /[A-Z]{3,}/.test(normalized) &&
          !/^ISBN\b/.test(normalized);

        const isShortNumbered =
          hasNumbering &&
          normalized.length >= 4 &&
          normalized.length <= 45 &&
          !/\d+%/.test(normalized) &&
          !/\b(?:ISBN|edition|ed\.)\b/i.test(normalized);

        if (isAllCaps || isShortNumbered) {
          current = "other";
          continue;
        }
      }
    }

    sections[current].push(block);
  }

  return sections;
}

function blocksFromPlainText(rawText: string): PdfLayoutBlock[] {
  const lines = rawText
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .split("\n")
    .map((l) => l.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean);

  return lines.map((line) => ({
    page: 1,
    kind: /^[-•*▪]\s+/.test(line) ? "list_item" : "paragraph",
    text: line,
    cells: [line],
    fontSize: 10.5,
    isBold: false,
  }));
}

/** Extract key-value pair from either a visual table row (cells) or a "Key: Value" line */
function parseKeyValue(block: PdfLayoutBlock): { key: string; value: string } | null {
  if (block.cells.length >= 2) {
    const key = block.cells[0].replace(/[:\-–—\s]+$/, "").trim();
    const value = block.cells.slice(1).join(" ").trim();
    if (key.length > 0 && key.length <= 40) {
      return { key, value };
    }
  }
  const m = block.text.match(/^([A-Za-z][A-Za-z\s/()-]{1,36})\s*:\s*(.*)$/);
  if (m) {
    return { key: m[1].trim(), value: m[2].trim() };
  }
  return null;
}

function extractCourseHeader(blocks: PdfLayoutBlock[]) {
  const topBlocks = blocks.slice(0, 30);
  const topText = topBlocks.map((b) => b.text).join("\n");

  let courseCode = "";
  let courseTitle = "";
  let term = "";
  let department = "";

  const termMatch = topText.match(
    /\b(Fall|Winter|Spring|Summer|Autumn)\s+(20\d{2})(?:\s*[-/]\s*(?:20)?\d{2})?\b/i
  );
  if (termMatch) {
    term = `${termMatch[1][0].toUpperCase()}${termMatch[1].slice(1).toLowerCase()} ${termMatch[2]}`;
  }

  for (const block of topBlocks) {
    const line = block.text;
    if (!department) {
      const deptMatch = line.match(
        /(?:(?:[A-Z][A-Za-z'&-]+\s+){0,4}(?:Department|Dept\.|Faculty|School)\s+of\s+[A-Za-z0-9\s,&'-]+)/i
      );
      if (deptMatch) {
        department = deptMatch[0]
          .replace(/\s*[—–-]\s*(?:Fall|Winter|Spring|Summer|Course\s+Outline).*$/i, "")
          .replace(/[,.;:\s]+$/, "")
          .trim();
      }
    }

    if (!courseCode) {
      const codeTitleMatch = line.match(
        /\b([A-Z]{2,5}[\s-]?\d{3,4}[A-Z]?)\s*(?:[:\-–—|]\s*(.+))?$/
      );
      if (codeTitleMatch) {
        courseCode = codeTitleMatch[1].replace(/\s+/, " ").trim();
        if (codeTitleMatch[2] && codeTitleMatch[2].trim().length > 2) {
          courseTitle = codeTitleMatch[2]
            .replace(/\s*\((?:Fall|Winter|Spring|Summer)\s+20\d{2}\)\s*$/i, "")
            .trim();
        }
      }
    }
  }

  if (!courseTitle && courseCode) {
    const codeIndex = topBlocks.findIndex((b) => b.text.includes(courseCode));
    if (codeIndex >= 0 && topBlocks[codeIndex + 1]) {
      const candidate = topBlocks[codeIndex + 1].text;
      if (
        candidate.length > 3 &&
        candidate.length < 100 &&
        !/^(?:instructor|professor|department|syllabus|course\s+outline|fall|winter|spring|summer)/i.test(
          candidate
        )
      ) {
        courseTitle = candidate;
      }
    }
  }

  return { courseCode, courseTitle, term, department };
}

function cleanPersonName(raw: string): string {
  return raw
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "")
    .replace(/\b(?:office|room|tel|phone|ext|hours?)\b.*$/i, "")
    .replace(/[()<>|•,\-–—]+\s*$/, "")
    .replace(/^[:\-–—\s]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function looksLikePersonName(raw: string): boolean {
  const s = raw.trim();
  if (s.length < 4 || s.length > 75) return false;
  if (/@|https?:\/\/|\d{2,}|:/.test(s)) return false;
  if (
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|fall|winter|spring|summer|course|outline|syllabus|university|department|faculty|school|building|room|office|hours|lecture|tutorial|lab|exam|midterm|final|edition|press)\b/i.test(
      s
    )
  ) {
    return false;
  }
  const stripped = s
    .replace(/^(?:Dr\.?|Prof\.?(?:essor)?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, "")
    .replace(/,\s*(?:Ph\.?D\.?|P\.?Eng\.?|M\.?Sc\.?|Ing\.?)\b.*$/i, "")
    .trim();
  const words = stripped.split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  return words.every((w) => /^[A-Z][a-zA-Z'.-]*$/.test(w));
}

function extractRoomFromText(text: string): string {
  const explicit = text.match(
    /\b(?:Room|Rm\.?|Bldg\.?|Building|Hall)\s+[A-Z0-9][A-Za-z0-9.\s-]{1,20}/i
  );
  if (explicit) return explicit[0].replace(/[,.;)\s]+$/, "").trim();

  const bldgCode = text.match(/\b([A-Z]{1,3}[\s-]?\d{1,4}(?:\.\d{1,3})?[A-Z]?)\b/);
  if (bldgCode) return bldgCode[1].trim();
  return "";
}

function extractInstructor(allBlocks: PdfLayoutBlock[], instructorBlocks: PdfLayoutBlock[]) {
  const topBlocks = allBlocks.slice(0, 45);
  const pool = [...instructorBlocks, ...topBlocks];

  let name = "";
  let email = "";
  let officeLocation = "";
  let officeHours = "";
  const teachingAssistants: string[] = [];

  for (let i = 0; i < pool.length; i++) {
    const block = pool[i];
    const nextBlock = pool[i + 1];
    const kv = parseKeyValue(block);

    if (kv) {
      const key = kv.key;
      const val = kv.value;

      if (
        !name &&
        /^(?:Instructor|Course\s+Instructor|Professor|Lecturer|Taught\s+by|Name)(?:\s*\([^)]*\))?$/i.test(
          key
        )
      ) {
        // Only treat generic "Name" key as instructor inside instructorBlocks
        if (!/^Name$/i.test(key) || instructorBlocks.includes(block)) {
          if (val) {
            const emailInVal = val.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
            if (emailInVal && !email) email = emailInVal[0];
            const cleaned = cleanPersonName(val);
            if (cleaned.length >= 3 && !/^(?:information|details|contact)$/i.test(cleaned)) {
              name = cleaned;
            }
          } else if (nextBlock && looksLikePersonName(nextBlock.text)) {
            name = cleanPersonName(nextBlock.text);
          }
        }
      }

      if (!email && /^(?:E-?mail|Contact)$/i.test(key)) {
        const em = val.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
        if (em) {
          email = em[0];
        } else if (!val && nextBlock) {
          const nextEm = nextBlock.text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
          if (nextEm) email = nextEm[0];
        }
      }

      if (!officeHours && /^Office\s+Hours?$/i.test(key)) {
        if (val) {
          officeHours = val;
        } else if (
          nextBlock &&
          /\d{1,2}:\d{2}|appointment|mon|tue|wed|thu|fri/i.test(nextBlock.text)
        ) {
          officeHours = nextBlock.text.trim();
        }
      }

      if (!officeLocation && /^(?:Office(?:\s+Location)?|Room)$/i.test(key)) {
        if (val) {
          officeLocation = val;
        } else if (
          nextBlock &&
          !/^(?:office|email|phone|tel|ta|teaching)/i.test(nextBlock.text)
        ) {
          officeLocation = nextBlock.text.trim();
        }
      }

      if (/^(?:Teaching\s+Assistants?|TAs?|Tutorial\s+Leaders?|Markers?)$/i.test(key)) {
        const rawItems = val
          ? val.split(/;\s*|,\s+(?=[A-Z])/)
          : nextBlock && !/^(?:office|email|textbook|exam|grading|course)/i.test(nextBlock.text)
          ? [nextBlock.text]
          : [];
        for (const p of rawItems.map((s) => s.trim()).filter(Boolean)) {
          if (!teachingAssistants.includes(p)) teachingAssistants.push(p);
        }
      }
    }

    // Bare email inside instructorSection
    if (!email && instructorBlocks.includes(block)) {
      const anyEmail = block.text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
      if (anyEmail && !/\b(?:ta|assistant|tutorial|marker)\b/i.test(block.text)) {
        email = anyEmail[0];
      }
    }
  }

  // Fallback 1: bare person-name block inside instructorSection (when "Instructor" was a heading)
  if (!name && instructorBlocks.length > 0) {
    const candidate = instructorBlocks.find((b) => looksLikePersonName(b.text));
    if (candidate) name = cleanPersonName(candidate.text);
  }

  // Fallback 2: correlate any found instructor email local-part against person-name lines
  if (!name && email) {
    const localPart = email.split("@")[0].toLowerCase();
    const tokens = localPart.split(/[._-]+/).filter((t) => t.length >= 3);
    const matched = topBlocks.find((b) => {
      if (b.text.includes("@")) return false;
      const lower = b.text.toLowerCase();
      return tokens.length >= 2
        ? tokens.every((t) => lower.includes(t))
        : tokens.some((t) => lower.includes(t)) && looksLikePersonName(b.text);
    });
    if (matched) {
      name = cleanPersonName(matched.text);
    } else {
      const titled = topBlocks.find(
        (b) => /^(?:Dr\.?|Prof\.?(?:essor)?)\s+[A-Z]/.test(b.text) && b.text.length < 70
      );
      if (titled) name = cleanPersonName(titled.text);
    }
  }

  // Fallback 3: extract embedded building/room code from Office Hours when Office Location is blank
  if (!officeLocation && officeHours) {
    const withoutTimes = officeHours
      .replace(
        /\b\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\s*(?:-|–|—|to)\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\b/g,
        ""
      )
      .replace(/\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\b/g, "")
      .trim();
    const room = extractRoomFromText(withoutTimes);
    if (room) officeLocation = room;
  }

  // Fallback 4: pick up first non-TA email in top blocks if still missing
  if (!email) {
    const topEmailBlock = topBlocks.find(
      (b) =>
        /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(b.text) &&
        !/\b(?:ta|assistant|helpdesk|support|admin)\b/i.test(b.text)
    );
    const m = topEmailBlock?.text.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
    if (m) email = m[0];
  }

  return {
    name,
    email,
    officeLocation,
    officeHours,
    teachingAssistants,
  };
}

const DATE_REGEX =
  /\b(?:20\d{2}-\d{1,2}-\d{1,2}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*20\d{2})?|\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?(?:,?\s*20\d{2})?|\d{1,2}\/\d{1,2}\/20\d{2})\b/i;

const TIME_REGEX =
  /\b\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\s*(?:-|–|—|to)\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)|\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\b/;

function extractExams(
  allBlocks: PdfLayoutBlock[],
  examBlocks: PdfLayoutBlock[],
  fallbackYear: number
) {
  const candidates = examBlocks.length > 0 ? [...examBlocks, ...allBlocks] : allBlocks;
  const seen = new Set<string>();
  const exams: Array<{
    title: string;
    date: string;
    time: string;
    location: string;
    weight: string;
    notes: string;
  }> = [];

  for (const block of candidates) {
    const line = block.text.replace(/^[-•*▪]\s*/, "").trim();
    const isExamLine =
      /\b(midterm(?:\s+exam)?(?:\s*\d+)?|final\s+exam(?:ination)?|exam\s*\d+|term\s+test\s*\d*|quiz\s*\d+)\b/i.test(
        line
      );
    const dateMatch = line.match(DATE_REGEX);

    if (!isExamLine) continue;
    if (!dateMatch && !examBlocks.includes(block)) continue;

    // Prefer first table cell as title when the exam is in a visual table row
    let title = "";
    if (block.cells.length >= 2 && block.cells[0].length >= 3 && block.cells[0].length <= 60) {
      title = block.cells[0].replace(/[:\-–—]+$/, "").trim();
    } else {
      const titleMatch = line.match(
        /^([^:–—|(]+?)(?=\s*(?:[:–—|]|\b(?:on|date)\b|$|\d{4}-|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)))/i
      );
      title = titleMatch ? titleMatch[1].trim() : "";
    }

    if (!title || title.length < 3 || title.length > 60) {
      const keywordMatch = line.match(
        /\b(Midterm(?:\s+Exam)?(?:\s*\d+)?|Final\s+Exam(?:ination)?|Term\s+Test\s*\d*|Exam\s*\d+|Quiz\s*\d+)\b/i
      );
      title = keywordMatch ? keywordMatch[1].trim() : "Exam";
    }
    title = title.replace(/[:\-–—]+$/, "").trim();

    const date = dateMatch
      ? normalizeDateToIso(dateMatch[0], fallbackYear)
      : /TBA|TBD|scheduled by registrar|exam period/i.test(line)
      ? "TBD"
      : "";

    if (!date) continue;

    const dedupeKey = `${title.toLowerCase()}|${date}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const timeMatch = line.match(TIME_REGEX);
    const weightMatch = line.match(/\b(\d{1,3}(?:\.\d+)?%)/);
    const locMatch = line.match(
      /\b(?:Room|Rm\.?|Hall|Building|Bldg\.?|Location|In)\s+([A-Z0-9][A-Za-z0-9\s-]{1,28}?)(?=[,;.|)]|$)/i
    );

    const notesParts: string[] = [];
    if (/closed\s+book/i.test(line)) notesParts.push("Closed book");
    if (/open\s+book/i.test(line)) notesParts.push("Open book");
    if (/cheat\s+sheet|crib\s+sheet|formula\s+sheet/i.test(line)) {
      notesParts.push("Formula/crib sheet allowed");
    }
    if (/cumulative/i.test(line)) notesParts.push("Cumulative");
    if (/chapters?\s+\d[\d\s,\-–&and]+/i.test(line)) {
      const ch = line.match(/chapters?\s+\d[\d\s,\-–&and]+/i);
      if (ch) notesParts.push(`Covers ${ch[0].trim()}`);
    }

    exams.push({
      title,
      date,
      time: timeMatch ? timeMatch[0].trim() : "",
      location: locMatch ? locMatch[0].replace(/^in\s+/i, "").trim() : "",
      weight: weightMatch ? weightMatch[1] : "",
      notes: notesParts.join("; "),
    });
  }

  return exams;
}

const PUBLISHER_REGEX =
  /\b(?:McGraw[\s-]?Hill|Pearson|Wiley|Springer|MIT\s+Press|Oxford(?:\s+University\s+Press)?|Cambridge(?:\s+University\s+Press)?|CRC\s+Press|Prentice\s+Hall|Cengage|Addison[\s-]?Wesley|O['’]Reilly|Elsevier|Morgan\s+Kaufmann|Brooks\/Cole|Academic\s+Press|Macmillan|Thomson|University\s+Press|Publishing|Publishers?)\b/i;

const EDITION_REGEX =
  /\b(\d+(?:st|nd|rd|th)\s+ed(?:ition)?\.?|(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth)\s+Edition|Ed(?:ition)?\.?\s*\d+(?:\.\d+)?)\b/i;

function looksLikeBookContinuation(prevLine: string, nextLine: string): boolean {
  if (/^[-•*▪]\s+/.test(nextLine)) return false;
  if (isTextbookSubheading(nextLine)) return false;
  if (/^https?:\/\//i.test(nextLine)) return false;
  if (/^[A-Z][A-Za-z\s/()-]{1,28}:\s*/.test(nextLine) && !/^ISBN/i.test(nextLine)) {
    return false;
  }

  if (/(?:,|\band|\bof|\bby|\b[A-Z]\.?)$/.test(prevLine.trim())) {
    return true;
  }
  if (PUBLISHER_REGEX.test(nextLine) && nextLine.length < 75 && !/:\s/.test(nextLine)) {
    return true;
  }
  if (/^(?:ISBN|Ed(?:ition)?\.?\s*\d|\d+(?:st|nd|rd|th)\s+ed|©|\(?\d{4}\)?\.?$)/i.test(nextLine)) {
    return true;
  }
  return false;
}

function looksLikeAuthorSegment(segment: string): boolean {
  const s = segment.trim();
  if (!s || s.length < 4 || s.length > 90) return false;
  if (PUBLISHER_REGEX.test(s) || EDITION_REGEX.test(s) || /^\d{4}$/.test(s)) return false;
  return /^[A-Z][a-zA-Z.'-]+(?:\s+(?:[A-Z]\.?|[A-Z][a-zA-Z.'-]+|and|&|et\s+al\.?)){1,8}$/.test(
    s.replace(/,\s*/g, " ")
  );
}

/**
 * Purely structural bibliographic scoring (zero course-specific blacklists).
 * Distinguishes real book citations from prose sentences, policies, and coursework items.
 */
function scoreBibliographicLikelihood(params: {
  rawLine: string;
  title: string;
  authors: string;
  edition: string;
  isbn: string;
  notes: string[];
  hadExplicitPrefix: boolean;
}): number {
  const { rawLine, title, authors, edition, isbn, notes, hadExplicitPrefix } = params;
  let score = 0;

  // Positive bibliographic signals
  if (isbn) score += 5;
  if (edition) score += 3;
  if (authors) score += 2;
  if (PUBLISHER_REGEX.test(rawLine)) score += 2;
  if (/\b(?:19|20)\d{2}\b/.test(rawLine)) score += 2;
  if (/\bby\s+[A-Z][a-z]+/.test(rawLine)) score += 2;
  if (notes.some((n) => /https?:\/\//i.test(n))) score += 1;
  if (hadExplicitPrefix) score += 2;

  // Negative grammatical / non-book structural signals
  if (/\b\d+(?:\.\d+)?\s*(?:%|marks?|points?|pts)\b/i.test(rawLine)) score -= 6;
  if (
    /\b(?:will\s+be|must\s+be|should\s+be|are\s+expected|is\s+not\s+allowed|are\s+due|will\s+not\s+be|is\s+mandatory|can\s+be\s+found)\b/i.test(
      rawLine
    )
  ) {
    score -= 5;
  }
  if (title.length > 180 || rawLine.length > 260) score -= 4;
  if (/:\s*$/.test(title)) score -= 4;

  return score;
}

function extractTextbooks(textbookBlocks: PdfLayoutBlock[]) {
  const books: Array<{
    title: string;
    authors: string;
    edition: string;
    isbn: string;
    requirement: "required" | "suggested";
    notes: string;
  }> = [];

  let currentReq: "required" | "suggested" = "required";
  let pendingNoteLabel = "";

  interface Candidate {
    text: string;
    requirement: "required" | "suggested";
    attachedNotes: string[];
    hadExplicitPrefix: boolean;
  }
  const candidates: Candidate[] = [];

  for (const block of textbookBlocks) {
    const line = block.text.trim();
    if (!line) continue;

    // Update required vs. suggested subheading state
    const sub = isTextbookSubheading(line);
    if (sub) {
      currentReq = sub;
      pendingNoteLabel = "";
      continue;
    }

    // Short label ending with ":" (e.g., "Free version of the book:") acts as a note prefix for a following URL
    if (/:\s*$/.test(line) && line.length <= 65 && !/\bISBN\b/i.test(line)) {
      pendingNoteLabel = line.replace(/:\s*$/, "").trim();
      continue;
    }

    // Standalone URL -> attach as a note on the preceding textbook
    if (/^(?:https?:\/\/|www\.)\S+$/i.test(line)) {
      if (candidates.length > 0) {
        const note = pendingNoteLabel ? `${pendingNoteLabel}: ${line}` : line;
        candidates[candidates.length - 1].attachedNotes.push(note);
      }
      pendingNoteLabel = "";
      continue;
    }

    // Label + inline URL ("Free version: https://...")
    if (/^[^:]{3,45}:\s*https?:\/\/\S+$/i.test(line)) {
      if (candidates.length > 0) {
        candidates[candidates.length - 1].attachedNotes.push(line);
      }
      pendingNoteLabel = "";
      continue;
    }

    const stripped = line.replace(/^[-•*▪]\s*|^\[\d+\]\s*|^\d+[.)]\s*/, "").trim();
    if (!stripped) continue;

    // Merge wrapped multi-line citation into preceding candidate
    if (
      candidates.length > 0 &&
      looksLikeBookContinuation(candidates[candidates.length - 1].text, line)
    ) {
      candidates[candidates.length - 1].text = `${candidates[candidates.length - 1].text} ${stripped}`
        .replace(/,\s*,+/g, ",")
        .replace(/\s{2,}/g, " ")
        .trim();
      continue;
    }

    pendingNoteLabel = "";

    const hadExplicitPrefix = /^(?:Required|Suggested|Recommended|Optional|Reference)\s*:/i.test(
      stripped
    );
    let requirement: "required" | "suggested" = currentReq;
    if (/\b(?:suggested|recommended|optional|supplementary|reference)\b/i.test(stripped)) {
      requirement = "suggested";
    } else if (/\brequired\b/i.test(stripped)) {
      requirement = "required";
    }

    candidates.push({
      text: stripped,
      requirement,
      attachedNotes: [],
      hadExplicitPrefix,
    });
  }

  for (const candidate of candidates) {
    const line = candidate.text;
    const isbnMatch = line.match(/ISBN(?:-1[03])?\s*:?\s*([0-9Xx-]{10,17})/);
    const editionMatch = line.match(EDITION_REGEX);
    const urlMatch = line.match(/https?:\/\/\S+/i);

    const extraNotes = [...candidate.attachedNotes];
    if (urlMatch) extraNotes.push(urlMatch[0]);

    const cleaned = line
      .replace(/^(?:Required|Suggested|Recommended|Optional|Reference)\s*:\s*/i, "")
      .replace(/\((?:Required|Suggested|Recommended|Optional|Reference)\)/gi, "")
      .replace(/ISBN(?:-1[03])?\s*:?\s*[0-9Xx-]{10,17}/gi, "")
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/,\s*,+/g, ",")
      .replace(/[,;.\s]+$/, "")
      .trim();

    let title = cleaned;
    let authors = "";

    const byMatch = cleaned.match(/^["“]?(.+?)["”]?\s+by\s+(.+)$/i);
    if (byMatch) {
      title = byMatch[1].replace(/[,.;]+$/, "").trim();
      authors = byMatch[2].replace(/[,.;]+$/, "").trim();
    } else {
      const dashMatch = cleaned.match(/^(.+?)\s+[—–]\s+(.+)$/);
      if (dashMatch && dashMatch[1].length > 3 && dashMatch[2].length > 2) {
        title = dashMatch[1].trim();
        authors = dashMatch[2].trim();
      } else {
        const parts = cleaned
          .split(/\s*,\s*/)
          .map((p) => p.trim())
          .filter(Boolean);

        if (parts.length >= 2) {
          const remaining: string[] = [];
          const authorParts: string[] = [];
          const metaParts: string[] = [];

          for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (i === 0) {
              remaining.push(part);
              continue;
            }
            if (EDITION_REGEX.test(part)) continue;
            if (PUBLISHER_REGEX.test(part) || /^(?:19|20)\d{2}$/.test(part)) {
              metaParts.push(part);
              continue;
            }
            if (looksLikeAuthorSegment(part)) {
              authorParts.push(part);
            } else {
              remaining.push(part);
            }
          }

          if (authorParts.length > 0) {
            title = remaining.join(", ");
            authors = authorParts.join(", ");
            if (metaParts.length > 0) extraNotes.push(metaParts.join(", "));
          }
        }
      }
    }

    if (editionMatch) {
      title = title
        .replace(editionMatch[0], "")
        .replace(/\(\s*\)/g, "")
        .replace(/[,.\s]+$/, "")
        .trim();
      authors = authors
        .replace(editionMatch[0], "")
        .replace(/\(\s*\)/g, "")
        .replace(/[,.\s]+$/, "")
        .trim();
    }

    const pubYearMatch = authors.match(
      new RegExp(`[,;]?\\s*(${PUBLISHER_REGEX.source}(?:,\\s*(?:19|20)\\d{2})?)$`, "i")
    );
    if (pubYearMatch) {
      extraNotes.push(pubYearMatch[1].trim());
      authors = authors.slice(0, pubYearMatch.index).replace(/[,;\s]+$/, "").trim();
    }

    const score = scoreBibliographicLikelihood({
      rawLine: line,
      title,
      authors,
      edition: editionMatch ? editionMatch[1] : "",
      isbn: isbnMatch ? isbnMatch[1] : "",
      notes: extraNotes,
      hadExplicitPrefix: candidate.hadExplicitPrefix,
    });

    if (score >= 2 && title.length > 2) {
      books.push({
        title,
        authors,
        edition: editionMatch ? editionMatch[1] : "",
        isbn: isbnMatch ? isbnMatch[1] : "",
        requirement: candidate.requirement,
        notes: Array.from(new Set(extraNotes)).join(" • "),
      });
    }
  }

  return books;
}

function extractExercises(exerciseBlocks: PdfLayoutBlock[], allBlocks: PdfLayoutBlock[]) {
  const scanBlocks =
    exerciseBlocks.length > 0
      ? exerciseBlocks
      : allBlocks.filter((b) =>
          /\b(?:suggested\s+exercises?|practice\s+problems?|exercises?\s*[:#]|\bCh(?:apter|\.)\s*\d+\s*[:\-–].*(?:problem|exercise|#|\d+-\d+))/i.test(
            b.text
          )
        );

  const exercises: Array<{
    topic: string;
    problems: string;
    textbook: string;
    weekOrDue: string;
  }> = [];

  for (const block of scanBlocks) {
    const line = block.text.replace(/^[-•*▪]\s*/, "").trim();
    if (line.length < 4) continue;

    const weekMatch = line.match(/\b(Week\s*\d+(?:\s*[-–]\s*\d+)?|Due\s+[^;,)]+)/i);
    const colonParts = line.split(/:\s+/);

    let topic = "";
    let problems = "";

    if (colonParts.length >= 2) {
      topic = colonParts[0].trim();
      problems = colonParts.slice(1).join(": ").trim();
    } else {
      const probMatch = line.match(
        /\b((?:Problems?|Exercises?|Questions?|Section|Sec\.|pp?\.)\s*[\dA-Za-z.,\s\-–#&]+)$/i
      );
      if (probMatch) {
        problems = probMatch[1].trim();
        topic = line.slice(0, probMatch.index).replace(/[-–—,|]+$/, "").trim();
      } else {
        topic = "Practice Set";
        problems = line;
      }
    }

    if (weekMatch) {
      topic = topic.replace(weekMatch[0], "").replace(/^[\s\-–—:()]+|[\s\-–—:()]+$/g, "");
    }

    exercises.push({
      topic: topic || "Practice Exercises",
      problems: problems || line,
      textbook: "",
      weekOrDue: weekMatch ? weekMatch[1].trim() : "",
    });
  }

  return exercises;
}

function isLetterGradeScaleLine(line: string): boolean {
  if (/^(?:[A-F][+-]?(?:\s*[,\/&]\s*|\s+(?:to|or|-|–)\s+))*[A-F][+-]?\s*[:=\-–|]/i.test(line)) {
    return true;
  }
  if (
    /\b(?:overall\s+mark|letter\s+grade|grade\s+scale|grade\s+conversion|grade\s+point|gpa|or\s+higher|or\s+above|or\s+below|below\s+\d+%)\b/i.test(
      line
    )
  ) {
    return true;
  }
  if (/\b\d{1,3}\s*%\s*(?:-|–|—|to)\s*\d{1,3}\s*%/i.test(line)) {
    return true;
  }
  return false;
}

function cleanGradingName(raw: string): string {
  return raw
    .replace(/^[-•*▪\d.)]+\s*/, "")
    .replace(
      /^(?:the\s+)?(?:final\s+|course\s+)?grades?\s+(?:will\s+be\s+|are\s+|is\s+)?(?:calculated|determined|computed|distributed|broken\s+down)\s+as\s+follows\s*:?\s*/i,
      ""
    )
    .replace(/^(?:calculated|determined|computed)\s+as\s+follows\s*:?\s*/i, "")
    .replace(/^(?:and|plus|&)\s+/i, "")
    .replace(/[([:;\-–—•|.,\s]+$/, "")
    .replace(/^[:;\-–—•|.,\s)]+/, "")
    .trim();
}

function extractInlineGradingPairs(
  text: string
): Array<{ name: string; weight: number; notes: string }> {
  const results: Array<{ name: string; weight: number; notes: string }> = [];
  const body = text.replace(
    /^.*?\b(?:calculated|determined|computed|distributed|allocated)\s+as\s+follows\s*:\s*/i,
    ""
  );

  const segments = body.split(/,\s*(?:and\s+)?|;\s*(?:and\s+)?|\s+and\s+(?=[A-Za-z][^%]*\d+\s*%)/i);
  if (segments.length < 2) return [];

  for (const seg of segments) {
    const trimmed = seg.trim();
    const m =
      trimmed.match(/^(.+?)\s*\(\s*(\d{1,3}(?:\.\d+)?)\s*%\s*\)(.*)$/) ||
      trimmed.match(/^(.+?)\s*[:\-–—]?\s*(\d{1,3}(?:\.\d+)?)\s*%(.*)$/);
    if (!m) continue;

    const weight = Number.parseFloat(m[2]);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) continue;

    const name = cleanGradingName(m[1]);
    const notes = m[3].replace(/^[\s),.;\-–—]+|[\s.;]+$/g, "").trim();
    if (!name || name.length > 60) continue;
    results.push({ name, weight, notes });
  }

  return results.length >= 2 ? results : [];
}

/**
 * If stray policy percentages push extracted grading items above 100%, select the
 * contiguous group (or subset when small) whose weights sum cleanly to 100%.
 */
function selectExactHundredPercentGroup<T extends { weight: number }>(items: T[]): T[] {
  const total = items.reduce((s, item) => s + item.weight, 0);
  if (items.length <= 1 || Math.abs(total - 100) <= 0.5) return items;

  // First prefer a contiguous slice summing to 100% (most syllabi list components consecutively)
  for (let start = 0; start < items.length; start++) {
    let sum = 0;
    for (let end = start; end < items.length; end++) {
      sum += items[end].weight;
      if (Math.abs(sum - 100) <= 0.5 && end - start >= 1) {
        return items.slice(start, end + 1);
      }
      if (sum > 100.5) break;
    }
  }

  // Secondary check: subset sum when list is small (<= 14 candidates)
  if (items.length <= 14) {
    let best: T[] | null = null;
    const totalMasks = 1 << items.length;
    for (let mask = 1; mask < totalMasks; mask++) {
      let sum = 0;
      let count = 0;
      for (let i = 0; i < items.length; i++) {
        if (mask & (1 << i)) {
          sum += items[i].weight;
          count += 1;
        }
      }
      if (count >= 2 && Math.abs(sum - 100) <= 0.5) {
        const subset = items.filter((_, i) => Boolean(mask & (1 << i)));
        if (!best || subset.length > best.length) {
          best = subset;
        }
      }
    }
    if (best) return best;
  }

  return items;
}

function extractGradingScheme(gradingBlocks: PdfLayoutBlock[], allBlocks: PdfLayoutBlock[]) {
  const pool = gradingBlocks.length > 0 ? gradingBlocks : allBlocks;
  const items: Array<{ name: string; weight: number; notes: string }> = [];
  const seen = new Set<string>();

  const addItem = (name: string, weight: number, notes: string) => {
    const cleanedName = cleanGradingName(name);
    if (!cleanedName || cleanedName.length > 75) return;
    if (/\b(?:total|passing\s+grade|minimum|penalty|late\s+deduction|per\s+day)\b/i.test(cleanedName)) {
      return;
    }
    const key = `${cleanedName.toLowerCase()}|${weight}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ name: cleanedName, weight, notes });
  };

  // Join wrapped prose lines inside gradingSection when a sentence continues across lines
  const mergedLines: string[] = [];
  for (const block of pool) {
    const line = block.text.replace(/^[-•*▪]\s*/, "").trim();
    if (isLetterGradeScaleLine(line)) continue;

    if (
      gradingBlocks.length > 0 &&
      mergedLines.length > 0 &&
      !isLetterGradeScaleLine(mergedLines[mergedLines.length - 1]) &&
      /(?:,\s*|\(\s*|\band\s*|:\s*)$/i.test(mergedLines[mergedLines.length - 1]) &&
      /^(?:and\s+|or\s+|\d+\s*%|[a-z])/i.test(line)
    ) {
      mergedLines[mergedLines.length - 1] = `${mergedLines[mergedLines.length - 1]} ${line}`;
    } else {
      mergedLines.push(line);
    }
  }

  for (const line of mergedLines) {
    if (isLetterGradeScaleLine(line)) continue;

    const inlinePairs = extractInlineGradingPairs(line);
    if (inlinePairs.length >= 2) {
      for (const pair of inlinePairs) {
        addItem(pair.name, pair.weight, pair.notes);
      }
      continue;
    }

    const allPctMatches = Array.from(line.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g));
    if (allPctMatches.length === 0) continue;

    const isInsideParens = (idx: number) => {
      let depth = 0;
      for (let i = 0; i < idx; i++) {
        if (line[i] === "(") depth += 1;
        else if (line[i] === ")" && depth > 0) depth -= 1;
      }
      return depth > 0;
    };

    const outsideParens = allPctMatches.filter(
      (m) => m.index !== undefined && !isInsideParens(m.index)
    );
    const pctMatch =
      outsideParens.length > 0
        ? outsideParens[outsideParens.length - 1]
        : allPctMatches[allPctMatches.length - 1];

    const weight = Number.parseFloat(pctMatch[1]);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 100) continue;

    if (
      /\b(?:total|passing\s+grade|minimum|penalty|late\s+deduction|per\s+day)\b/i.test(line) &&
      outsideParens.length === 0
    ) {
      continue;
    }

    if (
      gradingBlocks.length === 0 &&
      !/\b(assignment|homework|lab|midterm|final|exam|quiz|project|participation|attendance|tutorial|paper|essay|presentation)\b/i.test(
        line
      )
    ) {
      continue;
    }

    const beforePct = line.slice(0, pctMatch.index).replace(/[:\-–—•|.\s(]+$/, "").trim();
    const afterPct = line
      .slice((pctMatch.index ?? 0) + pctMatch[0].length)
      .replace(/^[:\-–—•|,\s)]+/, "")
      .trim();

    let name = beforePct || afterPct;
    let notes = beforePct ? afterPct : "";

    const parenMatch = name.match(/\(([^)]+)\)/);
    if (parenMatch) {
      const parenText = parenMatch[1].trim();
      name = name.replace(parenMatch[0], "").trim();
      notes = notes ? `${parenText}; ${notes}` : parenText;
    }

    notes = notes.replace(/^\(|\)$/g, "").trim();
    addItem(name, weight, notes);
  }

  return selectExactHundredPercentGroup(items);
}

export function parseSyllabusFromLayout(
  layout: PdfLayoutDocument,
  extraWarnings: string[] = []
): ExtractedSyllabus {
  const sections = splitBlocksIntoSections(layout.blocks);
  const header = extractCourseHeader(layout.blocks);

  const yearFromTerm = header.term.match(/(20\d{2})/);
  const fallbackYear = yearFromTerm ? Number(yearFromTerm[1]) : new Date().getFullYear();

  const instructor = extractInstructor(layout.blocks, sections.instructor);
  const exams = extractExams(layout.blocks, sections.exams, fallbackYear);
  const textbooks = extractTextbooks(sections.textbooks);
  const exercises = extractExercises(sections.exercises, layout.blocks);
  const gradingScheme = extractGradingScheme(sections.grading, layout.blocks);

  const warnings: string[] = [...extraWarnings];
  if (layout.text.trim().length < 120) {
    warnings.push(
      "Very little selectable text was found in this PDF (it may be scanned). Configure a Gemini API key in AI Settings to extract scanned PDFs natively."
    );
  } else {
    warnings.push(
      "Extracted using the layout-aware offline parser. For complex or unusual syllabus layouts, connect a free Gemini API key or local Ollama model in AI Settings."
    );
  }

  return normalizeExtractedSyllabus(
    {
      courseCode: header.courseCode,
      courseTitle: header.courseTitle,
      term: header.term,
      department: header.department,
      instructor,
      exams,
      textbooks,
      exercises,
      gradingScheme,
    },
    "local",
    warnings,
    {
      pageCount: layout.pageCount,
      rawTextPreview: layout.text.slice(0, 2500),
    }
  );
}

export function parseSyllabusHeuristically(
  rawText: string,
  meta?: { pageCount?: number; extraWarnings?: string[] }
): ExtractedSyllabus {
  const blocks = blocksFromPlainText(rawText);
  const layout: PdfLayoutDocument = {
    pageCount: meta?.pageCount ?? 1,
    bodyFontSize: 10.5,
    lines: [],
    blocks,
    text: rawText,
  };
  return parseSyllabusFromLayout(layout, meta?.extraWarnings ?? []);
}
