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

  // YYYY-MM-DD
  const iso = trimmed.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${pad2(Number(iso[2]))}-${pad2(Number(iso[3]))}`;
  }

  // Month DD, YYYY or Month DD
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

  // DD Month YYYY
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

  // MM/DD/YYYY
  const slash = trimmed.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  if (slash) {
    return `${slash[3]}-${pad2(Number(slash[1]))}-${pad2(Number(slash[2]))}`;
  }

  return trimmed;
}

function cleanLines(text: string): string[] {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00A0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line) => line.length > 0);
}

type SectionKey =
  | "header"
  | "instructor"
  | "exams"
  | "textbooks"
  | "exercises"
  | "grading"
  | "other";

function detectSectionHeading(line: string): SectionKey | null {
  if (line.length > 90) return null;
  // Strip leading numbering like "1.", "IV.", "Section 2:"
  const normalized = line
    .replace(/^(?:section\s+)?(?:\d+(?:\.\d+)*|[IVX]+)[.):\-]?\s+/i, "")
    .replace(/[:\-–—]+$/, "")
    .trim();

  if (/^(?:instructor|professor|course\s+staff|teaching\s+team|contact\s+information)/i.test(normalized)) {
    return "instructor";
  }
  if (
    /^(?:grading(?:\s+scheme|\s+breakdown|\s+policy)?|evaluation|assessment|marking\s+scheme|course\s+grades?|grade\s+distribution|weights?)$/i.test(
      normalized
    ) ||
    /^(?:grading\s+scheme|evaluation\s+breakdown|assessment\s+scheme)/i.test(normalized)
  ) {
    return "grading";
  }
  if (
    /^(?:exam(?:s|\s+dates|\s+schedule)?|important\s+dates|key\s+dates|test\s+dates|midterm\s+and\s+final)/i.test(
      normalized
    )
  ) {
    return "exams";
  }
  if (
    /^(?:(?:required\s+(?:and|&|\/)\s+)?(?:suggested|recommended|optional)?\s*textbooks?|course\s+materials?|required\s+readings?|readings?\s+(?:and|&)\s+textbooks?|references?)/i.test(
      normalized
    )
  ) {
    return "textbooks";
  }
  if (
    /^(?:suggested\s+exercises?|practice\s+problems?|recommended\s+(?:exercises?|problems?)|homework\s+problems?|exercises?\s+(?:and|&)\s+problems?)/i.test(
      normalized
    )
  ) {
    return "exercises";
  }
  if (
    /^(?:course\s+(?:description|objectives|outcomes|policies|schedule)|academic\s+integrity|accommodations?|prerequisites?|weekly\s+schedule|topics\s+covered|late\s+policy|attendance)/i.test(
      normalized
    )
  ) {
    return "other";
  }
  return null;
}

function splitIntoSections(lines: string[]): Record<SectionKey, string[]> {
  const sections: Record<SectionKey, string[]> = {
    header: [],
    instructor: [],
    exams: [],
    textbooks: [],
    exercises: [],
    grading: [],
    other: [],
  };

  let current: SectionKey = "header";
  for (const line of lines) {
    const heading = detectSectionHeading(line);
    if (heading) {
      current = heading;
      continue;
    }
    sections[current].push(line);
  }
  return sections;
}

function extractCourseHeader(lines: string[]) {
  const topLines = lines.slice(0, 20);
  const topText = topLines.join("\n");

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

  for (const line of topLines) {
    const deptMatch = line.match(/^(?:Department|Faculty|School)\s+of\s+(.+)$/i);
    if (deptMatch && !department) {
      department = line.trim();
    }

    if (!courseCode) {
      const codeTitleMatch = line.match(
        /\b([A-Z]{2,5}[\s-]?\d{3,4}[A-Z]?)\s*(?:[:\-–—]\s*(.+))?$/
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
    const codeIndex = topLines.findIndex((l) => l.includes(courseCode));
    if (codeIndex >= 0 && topLines[codeIndex + 1]) {
      const candidate = topLines[codeIndex + 1];
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

function extractInstructor(lines: string[], instructorSection: string[]) {
  const pool = [...instructorSection, ...lines.slice(0, 40)];

  let name = "";
  let email = "";
  let officeLocation = "";
  let officeHours = "";
  const teachingAssistants: string[] = [];

  for (const line of pool) {
    if (!name) {
      const m = line.match(
        /^(?:Instructor|Course\s+Instructor|Professor|Lecturer|Taught\s+by)\s*:\s*(.+)$/i
      );
      if (m) {
        const value = m[1].trim();
        const emailInLine = value.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
        if (emailInLine && !email) email = emailInLine[0];
        name = value
          .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "")
          .replace(/[()<>|•,-]+\s*$/, "")
          .replace(/\s{2,}/g, " ")
          .trim();
      }
    }

    if (!email) {
      const m = line.match(/^(?:E-?mail|Contact)\s*:\s*([\w.+-]+@[\w.-]+\.[a-z]{2,})/i);
      if (m) {
        email = m[1].trim();
      } else if (instructorSection.includes(line)) {
        const anyEmail = line.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
        if (anyEmail && !/ta|assistant/i.test(line)) {
          email = anyEmail[0];
        }
      }
    }

    if (!officeHours) {
      const m = line.match(/^Office\s+Hours?\s*:\s*(.+)$/i);
      if (m) officeHours = m[1].trim();
    }

    if (!officeLocation) {
      const m = line.match(/^(?:Office(?:\s+Location)?|Room)\s*:\s*(.+)$/i);
      if (m && !/^hours/i.test(m[1].trim())) {
        officeLocation = m[1].trim();
      }
    }

    const taMatch = line.match(/^(?:Teaching\s+Assistants?|TAs?)\s*:\s*(.+)$/i);
    if (taMatch) {
      const parts = taMatch[1]
        .split(/;\s*|,\s+(?=[A-Z])/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const p of parts) {
        if (!teachingAssistants.includes(p)) {
          teachingAssistants.push(p);
        }
      }
    }
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

function extractExams(allLines: string[], examSection: string[], fallbackYear: number) {
  const candidates = examSection.length > 0 ? [...examSection, ...allLines] : allLines;
  const seen = new Set<string>();
  const exams: Array<{
    title: string;
    date: string;
    time: string;
    location: string;
    weight: string;
    notes: string;
  }> = [];

  for (const rawLine of candidates) {
    const line = rawLine.replace(/^[-•*▪]\s*/, "").trim();
    const isExamLine =
      /\b(midterm(?:\s+exam)?(?:\s*\d+)?|final\s+exam(?:ination)?|exam\s*\d+|term\s+test\s*\d*|quiz\s*\d+)\b/i.test(
        line
      );
    const dateMatch = line.match(DATE_REGEX);

    if (!isExamLine) continue;
    if (!dateMatch && !examSection.includes(rawLine)) continue;

    // Derive title
    const titleMatch = line.match(
      /^([^:–—|(]+?)(?=\s*(?:[:–—|]|\b(?:on|date)\b|$|\d{4}-|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)))/i
    );
    let title = titleMatch ? titleMatch[1].trim() : "";
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

function extractTextbooks(textbookSection: string[]) {
  const books: Array<{
    title: string;
    authors: string;
    edition: string;
    isbn: string;
    requirement: "required" | "suggested";
    notes: string;
  }> = [];

  let currentReq: "required" | "suggested" = "required";

  for (const rawLine of textbookSection) {
    const line = rawLine.replace(/^[-•*▪\d.)]+\s*/, "").trim();
    if (line.length < 5) continue;

    if (/^(?:required\s+(?:textbooks?|readings?|materials?))\s*:?$/i.test(line)) {
      currentReq = "required";
      continue;
    }
    if (/^(?:(?:suggested|recommended|optional|supplementary)\s+(?:textbooks?|readings?|references?|materials?))\s*:?$/i.test(line)) {
      currentReq = "suggested";
      continue;
    }

    let requirement: "required" | "suggested" = currentReq;
    if (/\b(?:suggested|recommended|optional|supplementary)\b/i.test(line)) {
      requirement = "suggested";
    } else if (/\brequired\b/i.test(line)) {
      requirement = "required";
    }

    const isbnMatch = line.match(/ISBN(?:-1[03])?\s*:?\s*([0-9Xx-]{10,17})/);
    const editionMatch = line.match(
      /\b(\d+(?:st|nd|rd|th)\s+(?:ed(?:ition)?\.?)|(?:First|Second|Third|Fourth|Fifth|Sixth)\s+Edition)\b/i
    );

    const cleaned = line
      .replace(/^(?:Required|Suggested|Recommended|Optional)\s*:\s*/i, "")
      .replace(/\((?:Required|Suggested|Recommended|Optional)\)/gi, "")
      .replace(/ISBN(?:-1[03])?\s*:?\s*[0-9Xx-]{10,17}/gi, "")
      .replace(/[,;.\s]+$/, "")
      .trim();

    let title = cleaned;
    let authors = "";

    // Pattern: "Title" by Author Name
    const byMatch = cleaned.match(/^["“]?(.+?)["”]?\s+by\s+(.+)$/i);
    if (byMatch) {
      title = byMatch[1].replace(/[,.;]+$/, "").trim();
      authors = byMatch[2].replace(/[,.;]+$/, "").trim();
    } else {
      // Pattern: Author (Year). Title. or Title — Author
      const dashMatch = cleaned.match(/^(.+?)\s+[—–-]\s+(.+)$/);
      if (dashMatch && dashMatch[1].length > 3 && dashMatch[2].length > 2) {
        title = dashMatch[1].trim();
        authors = dashMatch[2].trim();
      }
    }

    // Strip edition from title/authors if duplicated
    if (editionMatch) {
      title = title.replace(editionMatch[0], "").replace(/\(\s*\)/g, "").replace(/,\s*$/, "").trim();
      authors = authors.replace(editionMatch[0], "").replace(/\(\s*\)/g, "").replace(/,\s*$/, "").trim();
    }

    if (title.length > 2) {
      books.push({
        title,
        authors,
        edition: editionMatch ? editionMatch[1] : "",
        isbn: isbnMatch ? isbnMatch[1] : "",
        requirement,
        notes: "",
      });
    }
  }

  return books;
}

function extractExercises(exerciseSection: string[], allLines: string[]) {
  const pool = exerciseSection.length > 0 ? exerciseSection : [];
  const exercises: Array<{
    topic: string;
    problems: string;
    textbook: string;
    weekOrDue: string;
  }> = [];

  const scanLines = pool.length > 0
    ? pool
    : allLines.filter((l) =>
        /\b(?:suggested\s+exercises?|practice\s+problems?|exercises?\s*[:#]|\bCh(?:apter|\.)\s*\d+\s*[:\-–].*(?:problem|exercise|#|\d+-\d+))/i.test(
          l
        )
      );

  for (const rawLine of scanLines) {
    const line = rawLine.replace(/^[-•*▪]\s*/, "").trim();
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

function extractGradingScheme(gradingSection: string[], allLines: string[]) {
  const pool = gradingSection.length > 0 ? gradingSection : allLines;
  const items: Array<{ name: string; weight: number; notes: string }> = [];
  const seen = new Set<string>();

  for (const rawLine of pool) {
    const line = rawLine.replace(/^[-•*▪]\s*/, "").trim();
    const allPctMatches = Array.from(line.matchAll(/(\d{1,3}(?:\.\d+)?)\s*%/g));
    if (allPctMatches.length === 0) continue;

    // Prefer percentage values outside parentheses (e.g. "Final Exam (min 40% to pass): 35%" -> 35%)
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

    // Skip lines that look like letter grade scales ("A+ : 90% - 100%")
    if (/^[A-F][+-]?\s*[:=\-–]\s*\d/i.test(line)) continue;
    if (/\b(?:total|passing\s+grade|minimum|penalty|late\s+deduction|per\s+day)\b/i.test(line)) {
      continue;
    }

    // If scanning full document (no grading section detected), require assessment keywords
    if (
      gradingSection.length === 0 &&
      !/\b(assignment|homework|lab|midterm|final|exam|quiz|project|participation|attendance|tutorial|paper|essay|presentation)\b/i.test(
        line
      )
    ) {
      continue;
    }

    const beforePct = line.slice(0, pctMatch.index).replace(/[:\-–—•|.\s]+$/, "").trim();
    const afterPct = line
      .slice((pctMatch.index ?? 0) + pctMatch[0].length)
      .replace(/^[:\-–—•|,\s]+/, "")
      .trim();

    let name = beforePct || afterPct;
    let notes = beforePct ? afterPct : "";

    // Extract parenthetical note from name
    const parenMatch = name.match(/\(([^)]+)\)/);
    if (parenMatch) {
      const parenText = parenMatch[1].trim();
      name = name.replace(parenMatch[0], "").trim();
      notes = notes ? `${parenText}; ${notes}` : parenText;
    }

    name = name.replace(/[:\-–—.,]+$/, "").trim();
    notes = notes.replace(/^\(|\)$/g, "").trim();

    if (!name || name.length > 80) continue;
    const key = `${name.toLowerCase()}|${weight}`;
    if (seen.has(key)) continue;
    seen.add(key);

    items.push({ name, weight, notes });
  }

  return items;
}

export function parseSyllabusHeuristically(
  rawText: string,
  meta?: { pageCount?: number; extraWarnings?: string[] }
): ExtractedSyllabus {
  const lines = cleanLines(rawText);
  const sections = splitIntoSections(lines);
  const header = extractCourseHeader(lines);

  const yearFromTerm = header.term.match(/(20\d{2})/);
  const fallbackYear = yearFromTerm ? Number(yearFromTerm[1]) : new Date().getFullYear();

  const instructor = extractInstructor(lines, sections.instructor);
  const exams = extractExams(lines, sections.exams, fallbackYear);
  const textbooks = extractTextbooks(sections.textbooks);
  const exercises = extractExercises(sections.exercises, lines);
  const gradingScheme = extractGradingScheme(sections.grading, lines);

  const warnings: string[] = [...(meta?.extraWarnings ?? [])];
  if (rawText.trim().length < 120) {
    warnings.push(
      "Very little selectable text was found in this PDF (it may be scanned). Add a Gemini API key in AI Settings to extract scanned PDFs accurately."
    );
  } else {
    warnings.push(
      "Extracted using the built-in local heuristic parser. You can review or edit any field alongside the PDF, or configure a Gemini/OpenAI API key for AI-powered extraction."
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
      pageCount: meta?.pageCount,
      rawTextPreview: rawText.slice(0, 2500),
    }
  );
}
