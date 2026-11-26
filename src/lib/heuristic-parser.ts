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

function detectSectionHeading(line: string, currentSection: SectionKey): SectionKey | null {
  if (line.length > 120) return null;
  // Don't treat URLs as headings
  if (/^https?:\/\//i.test(line)) return null;

  // Preserve required/suggested textbook subheadings inside textbooks section
  if (
    currentSection === "textbooks" &&
    /^(?:required|suggested|recommended|optional|supplementary|reference)\s+(?:textbooks?|books?|readings?|references?|materials?)\s*:?$/i.test(
      line
    )
  ) {
    return null;
  }

  // Inline prefix headings that clearly end the textbooks section even when prose follows on the same line
  if (currentSection === "textbooks") {
    if (
      /^(?:evaluation|grading(?:\s+scheme|\s+policy)?|marking\s+scheme|assessment)\s*:/i.test(line)
    ) {
      return "grading";
    }
    if (
      /^(?:other\s+course\s+materials?|course\s+requirements?|assignments?|projects?|quizzes?|tutorials?|laborator(?:y|ies)|labs?|software|matlab|course\s+content|course\s+schedule|course\s+outline|important\s+notes?|policies|calculator)/i.test(
        line
      ) &&
      (/:/.test(line) || /\(\s*\d+\s*(?:marks?|points?|%)/i.test(line))
    ) {
      return "other";
    }
  }

  if (line.length > 85 || /\.\s*$/.test(line)) return null;

  const hasNumbering = /^(?:section\s+)?(?:\d+(?:\.\d+)*|[IVX]+)[.):\-]\s+/i.test(line);
  const normalized = line
    .replace(/^(?:section\s+)?(?:\d+(?:\.\d+)*|[IVX]+)[.):\-]?\s+/i, "")
    .replace(/[:\-–—]+$/, "")
    .trim();

  if (!normalized) return null;

  if (
    /^(?:instructor(?:\s+information)?|professor|course\s+staff|teaching\s+team|contact\s+information)$/i.test(
      normalized
    )
  ) {
    return "instructor";
  }
  if (
    /^(?:grading(?:\s+scheme|\s+breakdown|\s+policy|\s+system)?|evaluation(?:\s+scheme|\s+breakdown|\s+and\s+grading)?|assessment(?:\s+scheme|\s+and\s+grading)?|marking\s+scheme|course\s+grades?|grade\s+distribution|course\s+evaluation|weights?)$/i.test(
      normalized
    )
  ) {
    return "grading";
  }
  if (
    /^(?:exam(?:s|\s+dates|\s+schedule)?|examinations?|important\s+dates|key\s+dates|test\s+dates|midterm\s+and\s+final(?:\s+exams?)?)$/i.test(
      normalized
    )
  ) {
    return "exams";
  }
  if (
    /^(?:(?:required\s+(?:and|&|\/)\s+)?(?:suggested|recommended|optional|reference)?\s*textbooks?|course\s+textbooks?|course\s+materials?|required\s+readings?|readings?\s+(?:and|&)\s+textbooks?|textbooks?\s+(?:and|&)\s+references?|references?)$/i.test(
      normalized
    )
  ) {
    return "textbooks";
  }
  if (
    /^(?:suggested\s+exercises?|practice\s+problems?|recommended\s+(?:exercises?|problems?)|homework\s+problems?|exercises?\s+(?:and|&)\s+problems?|problem\s+sets?)$/i.test(
      normalized
    )
  ) {
    return "exercises";
  }
  if (
    /^(?:course\s+(?:description|content|topics|outline|overview|objectives|outcomes|policies|schedule|calendar|website|format|delivery|expectations)|calendar\s+description|learning\s+(?:outcomes|objectives)|weekly\s+schedule|lecture\s+schedule|class\s+schedule|tentative\s+schedule|topics?(?:\s+covered|\s+outline)?|tutorials?(?:\s+and\s+labs?)?|laborator(?:y|ies)|labs?(?:\s+and\s+tutorials?)?|assignments?(?:\s+and\s+tutorials?)?|software|matlab|computing|academic\s+integrity|plagiarism|accommodations?|accessibility|equity|diversity|inclusivity|student\s+(?:conduct|support|services|wellness)|health\s+and\s+wellness|mental\s+health|university\s+policies|general\s+policies|policies|late\s+(?:policy|submissions?)|attendance|regrading|deferred\s+exams?|missed\s+(?:exams?|tests?|work)|calculators?|calculator\s+policy|copyright|recording|privacy|communication|email\s+policy|prerequisites?|corequisites?|important\s+notes?|disclaimer|office\s+hours\s+and\s+help)$/i.test(
      normalized
    )
  ) {
    return "other";
  }

  // Generic numbered or ALL-CAPS short heading ends narrow sections like textbooks/grading/exams
  if (currentSection !== "header" && currentSection !== "other") {
    const isAllCapsHeading =
      normalized.length >= 4 &&
      normalized.length <= 45 &&
      /^[A-Z0-9\s&/,-]+$/.test(normalized) &&
      /[A-Z]{3,}/.test(normalized) &&
      !/^ISBN\b/.test(normalized);

    const isShortNumberedHeading =
      hasNumbering &&
      normalized.length >= 4 &&
      normalized.length <= 45 &&
      !/\d+%/.test(normalized) &&
      !/\b(?:ISBN|edition|ed\.|press|mcgraw|pearson|wiley|springer)\b/i.test(normalized);

    if (isAllCapsHeading || isShortNumberedHeading) {
      return "other";
    }
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
    const heading = detectSectionHeading(line, current);
    if (heading) {
      current = heading;
      continue;
    }
    sections[current].push(line);
  }
  return sections;
}

function extractCourseHeader(lines: string[]) {
  const topLines = lines.slice(0, 35);
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

function cleanPersonName(raw: string): string {
  return raw
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "")
    .replace(/\b(?:office|room|tel|phone|ext|hours?)\b.*$/i, "")
    .replace(/[()<>|•,\-–—]+\s*$/, "")
    .replace(/^[:\-–—\s]+/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function looksLikePersonNameLine(line: string): boolean {
  const s = line.trim();
  if (s.length < 4 || s.length > 75) return false;
  if (/@|https?:\/\/|\d{2,}|:/.test(s)) return false;
  if (
    /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|fall|winter|spring|summer|course|outline|syllabus|university|department|faculty|school|building|room|office|hours|lecture|tutorial|lab|exam|midterm|final)\b/i.test(
      s
    )
  ) {
    return false;
  }
  const strippedTitles = s
    .replace(/^(?:Dr\.?|Prof\.?(?:essor)?|Mr\.?|Ms\.?|Mrs\.?)\s+/i, "")
    .replace(/,\s*(?:Ph\.?D\.?|P\.?Eng\.?|M\.?Sc\.?|Ing\.?)\b.*$/i, "")
    .trim();
  const words = strippedTitles.split(/\s+/);
  if (words.length < 2 || words.length > 5) return false;
  return words.every((w) => /^[A-Z][a-zA-Z'.-]*$/.test(w));
}

function extractRoomFromText(text: string): string {
  // Matches "Room 412B", "Rm. 204", "H 535", "H-535", "EV 5.123", "MB 3.210", "Hall 535"
  const explicit = text.match(
    /\b(?:Room|Rm\.?|Bldg\.?|Building|Hall)\s+[A-Z0-9][A-Za-z0-9.\s-]{1,20}/i
  );
  if (explicit) return explicit[0].replace(/[,.;)\s]+$/, "").trim();

  const bldgCode = text.match(/\b([A-Z]{1,3}[\s-]?\d{1,4}(?:\.\d{1,3})?[A-Z]?)\b/);
  if (bldgCode) return bldgCode[1].trim();
  return "";
}

function extractInstructor(lines: string[], instructorSection: string[]) {
  const topLines = lines.slice(0, 50);
  const pool = [...instructorSection, ...topLines];

  let name = "";
  let email = "";
  let officeLocation = "";
  let officeHours = "";
  const teachingAssistants: string[] = [];

  for (let i = 0; i < pool.length; i++) {
    const line = pool[i];
    const nextLine = pool[i + 1] ?? "";

    // Inline Instructor/Professor/Lecturer label (supports optional parenthetical like "Instructor (Sec S):")
    if (!name) {
      const m = line.match(
        /^(?:Instructor|Course\s+Instructor|Professor|Lecturer|Taught\s+by)(?:\s*\([^)]*\))?\s*[:\-–]?\s*(.*)$/i
      );
      if (m) {
        const inlineVal = m[1].trim();
        if (inlineVal) {
          const emailInLine = inlineVal.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
          if (emailInLine && !email) email = emailInLine[0];
          const cleaned = cleanPersonName(inlineVal);
          if (cleaned.length >= 3 && !/^(?:information|details|contact)$/i.test(cleaned)) {
            name = cleaned;
          }
        } else if (nextLine && looksLikePersonNameLine(nextLine)) {
          name = cleanPersonName(nextLine);
        }
      } else if (instructorSection.includes(line)) {
        const nameLabel = line.match(/^Name\s*:\s*(.+)$/i);
        if (nameLabel) {
          name = cleanPersonName(nameLabel[1]);
        }
      }
    }

    if (!email) {
      const m = line.match(/^(?:E-?mail|Contact)\s*:?\s*([\w.+-]+@[\w.-]+\.[a-z]{2,})/i);
      if (m) {
        email = m[1].trim();
      } else if (/^(?:E-?mail|Contact)\s*:?$/i.test(line)) {
        const nextEmail = nextLine.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
        if (nextEmail) email = nextEmail[0];
      } else if (instructorSection.includes(line)) {
        const anyEmail = line.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
        if (anyEmail && !/\b(?:ta|assistant|tutorial|marker)\b/i.test(line)) {
          email = anyEmail[0];
        }
      }
    }

    if (!officeHours) {
      const m = line.match(/^Office\s+Hours?\s*:\s*(.*)$/i);
      if (m) {
        officeHours = m[1].trim() || (nextLine && /\d{1,2}:\d{2}|appointment|mon|tue|wed|thu|fri/i.test(nextLine) ? nextLine.trim() : "");
      }
    }

    if (!officeLocation) {
      const m = line.match(/^(?:Office(?:\s+Location)?|Room)\s*:\s*(.*)$/i);
      if (m && !/^hours/i.test(m[1].trim())) {
        officeLocation = m[1].trim() || (nextLine && !/^(?:office|email|phone|tel|ta|teaching)/i.test(nextLine) ? nextLine.trim() : "");
      }
    }

    const taMatch = line.match(/^(?:Teaching\s+Assistants?|TAs?|Tutorial\s+Leaders?|Markers?)\s*:\s*(.*)$/i);
    if (taMatch) {
      const val = taMatch[1].trim();
      const rawItems = val
        ? val.split(/;\s*|,\s+(?=[A-Z])/)
        : nextLine && !/^(?:office|email|textbook|exam|grading|course)/i.test(nextLine)
        ? [nextLine]
        : [];
      for (const p of rawItems.map((s) => s.trim()).filter(Boolean)) {
        if (!teachingAssistants.includes(p)) {
          teachingAssistants.push(p);
        }
      }
    }
  }

  // Fallback 1: bare person-name line inside instructorSection (when "Instructor:" was consumed as section heading)
  if (!name && instructorSection.length > 0) {
    const candidate = instructorSection.find((l) => looksLikePersonNameLine(l));
    if (candidate) name = cleanPersonName(candidate);
  }

  // Fallback 2: if email was found (e.g. Danielle.nasrallah@...), match a line containing name parts or Dr./Prof.
  if (!name && email) {
    const localPart = email.split("@")[0].toLowerCase();
    const tokens = localPart.split(/[._-]+/).filter((t) => t.length >= 3);
    const matchedLine = topLines.find((l) => {
      if (l.includes("@")) return false;
      const lower = l.toLowerCase();
      return tokens.length >= 2
        ? tokens.every((t) => lower.includes(t))
        : tokens.some((t) => lower.includes(t)) && looksLikePersonNameLine(l);
    });
    if (matchedLine) {
      name = cleanPersonName(matchedLine);
    } else {
      const drLine = topLines.find(
        (l) => /^(?:Dr\.?|Prof\.?(?:essor)?)\s+[A-Z]/.test(l) && l.length < 70
      );
      if (drLine) name = cleanPersonName(drLine);
    }
  }

  // Fallback 3: extract embedded office/room code from Office Hours (e.g., "11:30 - 12:00 H 535" -> "H 535")
  if (!officeLocation && officeHours) {
    const strippedTime = officeHours
      .replace(
        /\b\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\s*(?:-|–|—|to)\s*\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\b/g,
        ""
      )
      .replace(/\b\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?\b/g, "")
      .trim();
    const extractedRoom = extractRoomFromText(strippedTime);
    if (extractedRoom) {
      officeLocation = extractedRoom;
    }
  }

  // Fallback 4: pick up first non-TA email in top lines if still missing
  if (!email) {
    const topEmailLine = topLines.find(
      (l) => /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(l) && !/\b(?:ta|assistant|helpdesk|support|admin)\b/i.test(l)
    );
    const m = topEmailLine?.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/i);
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

const PUBLISHER_REGEX =
  /\b(?:McGraw[\s-]?Hill|Pearson|Wiley|Springer|MIT\s+Press|Oxford|Cambridge|CRC\s+Press|Prentice\s+Hall|Cengage|Addison[\s-]?Wesley|O['’]Reilly|Elsevier|Morgan\s+Kaufmann|Brooks\/Cole|Academic\s+Press|Macmillan|Thomson|Schaum)\b/i;

const EDITION_REGEX =
  /\b(\d+(?:st|nd|rd|th)\s+ed(?:ition)?\.?|(?:First|Second|Third|Fourth|Fifth|Sixth|Seventh|Eighth)\s+Edition|Ed(?:ition)?\.?\s*\d+(?:\.\d+)?)\b/i;

function looksLikeBookContinuation(prevLine: string, nextLine: string): boolean {
  if (/^[-•*▪]\s+/.test(nextLine)) return false;
  if (/^(?:required|suggested|recommended|optional|reference)\b/i.test(nextLine)) return false;
  if (/^https?:\/\//i.test(nextLine)) return false;

  // Previous line clearly broke mid-name or mid-clause (e.g. "Michael J" or ending with "," or "and")
  if (/(?:,|\band|\bof|\bby|\b[A-Z]\.?)$/.test(prevLine.trim())) {
    return true;
  }

  // Next line starts with publisher, ISBN, edition, or short "Surname, Publisher, Year" fragment
  if (
    PUBLISHER_REGEX.test(nextLine) &&
    nextLine.length < 70 &&
    !/:\s/.test(nextLine)
  ) {
    return true;
  }
  if (/^(?:ISBN|Ed(?:ition)?\.?\s*\d|\d+(?:st|nd|rd|th)\s+ed|©|\(?\d{4}\)?\.?$)/i.test(nextLine)) {
    return true;
  }

  return false;
}

function isNonBookNoiseLine(line: string): boolean {
  if (line.length < 6 || line.length > 260) return true;
  // Pure URL or email
  if (/^(?:https?:\/\/|www\.|mailto:)/i.test(line)) return true;
  // Coursework / assessments / marks / weights (clearly not a textbook!)
  if (/\b\d+\s*(?:marks?|points?|pts)\b/i.test(line)) return true;
  if (/\b\d{1,3}%\b/.test(line) && !/\bbook|textbook|edition|isbn\b/i.test(line)) {
    return true;
  }
  if (
    /\b(?:other\s+course\s+material|quizzes?\s+\d|two\s+matlab\s+projects?|matlab\s+projects?|tutorial\s+problems?|lab\s+reports?|midterm\s+exam|final\s+exam|will\s+be\s+pos|posted\s+on|uploaded\s+to|brightspace|canvas|blackboard|moodle|piazza|gradescope)\b/i.test(
      line
    )
  ) {
    return true;
  }
  // Policy / instructional prose sentences
  if (
    /^(?:students?|please|you\s+(?:are|will|can|may|must|should)|this\s+course|the\s+course|lectures?|tutorials?|labs?|exams?|midterms?|final\s+exam|assignments?|homework|quizzes?|projects?|attendance|grading|evaluation|note\s+that|for\s+more\s+info|if\s+you|all\s+(?:students|exams|assignments|materials)|academic\s+integrity|in\s+accordance|university|faculty|department|copyright|calculators?|office\s+hours|prerequisite|solve\s+the\s+problems?)/i.test(
      line
    )
  ) {
    return true;
  }
  // Short heading-like label ending with ":" (e.g., "Free version of the book:")
  if (/:\s*$/.test(line) && line.length < 65) return true;
  // Pure conversational sentence with verbs and no real book citation clues
  const hasRealBookClue =
    EDITION_REGEX.test(line) ||
    PUBLISHER_REGEX.test(line) ||
    /\bISBN\b/i.test(line) ||
    /\b(?:19|20)\d{2}\b/.test(line) ||
    /\bby\s+[A-Z][a-z]+/i.test(line);
  if (
    !hasRealBookClue &&
    /\b(?:will\s+be|must\s+be|should\s+be|are\s+expected|is\s+not\s+allowed|can\s+be\s+found|is\s+mandatory|are\s+due|each\s+student)\b/i.test(
      line
    )
  ) {
    return true;
  }
  return false;
}

function isEndOfTextbooksTransition(line: string): boolean {
  return /^(?:other\s+course\s+materials?|course\s+work|coursework|deliverables?|evaluation|grading|quizzes?\b|projects?\b|two\s+.*\bprojects?\b|assignments?\b|homework\b|labs?\b|tutorials?\b|course\s+policies)/i.test(
    line
  );
}

function looksLikeAuthorSegment(segment: string): boolean {
  const s = segment.trim();
  if (!s || s.length < 4 || s.length > 90) return false;
  if (PUBLISHER_REGEX.test(s) || EDITION_REGEX.test(s) || /^\d{4}$/.test(s)) return false;
  // Matches names like "Michael D. Adams", "Michael J. Roberts", "A. Oppenheim and A. Willsky"
  return /^[A-Z][a-zA-Z.'-]+(?:\s+(?:[A-Z]\.?|[A-Z][a-zA-Z.'-]+|and|&|et\s+al\.?)){1,8}$/.test(
    s.replace(/,\s*/g, " ")
  );
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
  let pendingNoteLabel = "";

  // First pass: keep subheadings, attach URLs/labels to previous book, and merge wrapped citation lines
  interface CandidateLine {
    text: string;
    requirement: "required" | "suggested";
    attachedNotes: string[];
  }
  const candidates: CandidateLine[] = [];

  for (const rawLine of textbookSection) {
    const line = rawLine.trim();
    if (!line) continue;

    // Subheadings for required vs suggested/reference
    if (/^(?:required|mandatory|primary|course)\s+(?:textbooks?|books?|readings?|materials?)\s*:?$/i.test(line)) {
      currentReq = "required";
      pendingNoteLabel = "";
      continue;
    }
    if (
      /^(?:(?:suggested|recommended|optional|supplementary|additional|reference)\s+(?:textbooks?|books?|readings?|references?|materials?)|references?)\s*:?$/i.test(
        line
      )
    ) {
      currentReq = "suggested";
      pendingNoteLabel = "";
      continue;
    }

    // Label line like "Free version of the book:" -> save to pair with following URL
    if (/^(?:free\s+version|online\s+version|download|pdf\s+link|available\s+at|ebook|e-book|link|url|website)/i.test(line)) {
      const inlineUrl = line.match(/https?:\/\/\S+/i);
      if (inlineUrl && candidates.length > 0) {
        candidates[candidates.length - 1].attachedNotes.push(line);
        pendingNoteLabel = "";
      } else {
        pendingNoteLabel = line.replace(/:$/, "").trim();
      }
      continue;
    }

    // Standalone URL -> attach as note to previous textbook!
    if (/^(?:https?:\/\/|www\.)\S+$/i.test(line)) {
      if (candidates.length > 0) {
        const note = pendingNoteLabel ? `${pendingNoteLabel}: ${line}` : line;
        candidates[candidates.length - 1].attachedNotes.push(note);
      }
      pendingNoteLabel = "";
      continue;
    }

    const stripped = line.replace(/^[-•*▪]\s*|^\[\d+\]\s*|^\d+[.)]\s*/, "").trim();
    if (!stripped) continue;

    // Once we have found at least one textbook, stop if the document moves on to coursework/quizzes/other materials
    if (candidates.length > 0 && isEndOfTextbooksTransition(stripped)) {
      break;
    }

    // Merge wrapped multi-line citation into previous candidate
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
    if (isNonBookNoiseLine(stripped)) continue;

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

    // Pattern 1: "Title" by Author Name
    const byMatch = cleaned.match(/^["“]?(.+?)["”]?\s+by\s+(.+)$/i);
    if (byMatch) {
      title = byMatch[1].replace(/[,.;]+$/, "").trim();
      authors = byMatch[2].replace(/[,.;]+$/, "").trim();
    } else {
      // Pattern 2: Title — Author
      const dashMatch = cleaned.match(/^(.+?)\s+[—–]\s+(.+)$/);
      if (dashMatch && dashMatch[1].length > 3 && dashMatch[2].length > 2) {
        title = dashMatch[1].trim();
        authors = dashMatch[2].trim();
      } else {
        // Pattern 3: Comma-separated academic citation ("Signals and Systems, Michael D. Adams, Ed. 6.0")
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
            if (authorParts.length === 0 && looksLikeAuthorSegment(part)) {
              authorParts.push(part);
            } else if (authorParts.length > 0 && looksLikeAuthorSegment(part)) {
              authorParts.push(part);
            } else {
              remaining.push(part);
            }
          }

          if (authorParts.length > 0) {
            title = remaining.join(", ");
            authors = authorParts.join(", ");
            if (metaParts.length > 0) {
              extraNotes.push(metaParts.join(", "));
            }
          }
        }
      }
    }

    // Strip edition string from title/authors if duplicated
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

    // Strip trailing publisher/year from authors if present
    const pubYearMatch = authors.match(
      new RegExp(`[,;]?\\s*(${PUBLISHER_REGEX.source}(?:,\\s*(?:19|20)\\d{2})?)$`, "i")
    );
    if (pubYearMatch) {
      extraNotes.push(pubYearMatch[1].trim());
      authors = authors.slice(0, pubYearMatch.index).replace(/[,;\s]+$/, "").trim();
    }

    // Require at least one genuine book citation signal when a line has no authors/edition/ISBN/notes
    const hasBookMetadata = Boolean(
      authors ||
        editionMatch ||
        isbnMatch ||
        extraNotes.length > 0 ||
        PUBLISHER_REGEX.test(line) ||
        /\b(?:19|20)\d{2}\b/.test(line)
    );
    if (!hasBookMetadata && (title.split(/\s+/).length > 12 || /\([^)]*\d+[^)]*\)/.test(title))) {
      continue;
    }

    if (title.length > 2) {
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

  // Cap unreasonable extraction noise if a PDF had no recognizable section breaks
  return books.slice(0, 15);
}

function extractExercises(exerciseSection: string[], allLines: string[]) {
  const pool = exerciseSection.length > 0 ? exerciseSection : [];
  const exercises: Array<{
    topic: string;
    problems: string;
    textbook: string;
    weekOrDue: string;
  }> = [];

  const scanLines =
    pool.length > 0
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

function isLetterGradeScaleLine(line: string): boolean {
  // Matches "A+: 90-100%", "A-, A, A+: Overall mark of 80%", "B-, B, B+: 68% - 79%", "F: < 50%"
  if (
    /^(?:[A-F][+-]?(?:\s*[,\/&]\s*|\s+(?:to|or|-|–)\s+))*[A-F][+-]?\s*[:=\-–]/i.test(line)
  ) {
    return true;
  }
  if (
    /\b(?:overall\s+mark|letter\s+grade|grade\s+scale|grade\s+conversion|grade\s+point|gpa|or\s+higher|or\s+above|or\s+below|below\s+\d+%)\b/i.test(
      line
    )
  ) {
    return true;
  }
  // Range like "68% - 79%" or "80% to 100%"
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
  // Split prose sentences like "Tutorials (20%), Midterm (30%), and Final exam (50%)."
  // First strip intro clause up to "as follows:" if present
  const body = text.replace(
    /^.*?\b(?:calculated|determined|computed|distributed|allocated)\s+as\s+follows\s*:\s*/i,
    ""
  );

  const segments = body.split(/,\s*(?:and\s+)?|;\s*(?:and\s+)?|\s+and\s+(?=[A-Za-z][^%]*\d+\s*%)/i);
  if (segments.length < 2) return [];

  for (const seg of segments) {
    const trimmed = seg.trim();
    const m = trimmed.match(/^(.+?)\s*\(\s*(\d{1,3}(?:\.\d+)?)\s*%\s*\)(.*)$/) ||
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

function extractGradingScheme(gradingSection: string[], allLines: string[]) {
  const pool = gradingSection.length > 0 ? gradingSection : allLines;
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

  // Pre-pass: join consecutive prose lines inside gradingSection when a sentence wraps across lines
  // (e.g. "...calculated as follows: Tutorials (20%), Midterm (30%)," + "and Final exam (50%).")
  const mergedLines: string[] = [];
  for (const rawLine of pool) {
    const line = rawLine.replace(/^[-•*▪]\s*/, "").trim();
    if (isLetterGradeScaleLine(line)) continue;

    if (
      gradingSection.length > 0 &&
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

    // Check if the line contains multiple inline components (e.g. "Tutorials (20%), Midterm (30%), and Final exam (50%)")
    const inlinePairs = extractInlineGradingPairs(line);
    if (inlinePairs.length >= 2) {
      for (const pair of inlinePairs) {
        addItem(pair.name, pair.weight, pair.notes);
      }
      continue;
    }

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

    if (/\b(?:total|passing\s+grade|minimum|penalty|late\s+deduction|per\s+day)\b/i.test(line)) {
      // Allow lines like "Final Exam (must earn at least 40% to pass): 35%" when there's an outside-parens weight
      if (outsideParens.length === 0) continue;
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

    const beforePct = line.slice(0, pctMatch.index).replace(/[:\-–—•|.\s(]+$/, "").trim();
    const afterPct = line
      .slice((pctMatch.index ?? 0) + pctMatch[0].length)
      .replace(/^[:\-–—•|,\s)]+/, "")
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

    notes = notes.replace(/^\(|\)$/g, "").trim();
    addItem(name, weight, notes);
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
