import { parseSyllabusHeuristically } from "./heuristic-parser";
import { normalizeExtractedSyllabus } from "./schema";
import type { ExtractedSyllabus, ExtractionProvider } from "./types";

const EXTRACTION_SYSTEM_PROMPT = `You are an expert academic assistant that extracts structured data from university course outlines and syllabi.
Return ONLY valid JSON matching this exact shape (no markdown code fences, no commentary):
{
  "courseCode": "e.g. CS 301",
  "courseTitle": "Full course title",
  "term": "e.g. Fall 2026",
  "department": "Department or Faculty name if present",
  "instructor": {
    "name": "Instructor full name",
    "email": "Instructor email if present",
    "officeLocation": "Office room/building if present",
    "officeHours": "Office hours schedule if present",
    "teachingAssistants": ["TA Name (email if present)"]
  },
  "exams": [
    {
      "title": "e.g. Midterm Exam 1 or Final Exam",
      "date": "ISO YYYY-MM-DD when exact date is known, otherwise exact date text or TBD",
      "time": "e.g. 10:00 AM - 12:00 PM",
      "location": "Room or building if listed",
      "weight": "e.g. 25%",
      "notes": "Coverage, open/closed book, formula sheet rules, etc."
    }
  ],
  "textbooks": [
    {
      "title": "Book title",
      "authors": "Author(s)",
      "edition": "e.g. 3rd Edition",
      "isbn": "ISBN if listed",
      "requirement": "required or suggested",
      "notes": "Availability, free PDF link, or usage notes"
    }
  ],
  "exercises": [
    {
      "topic": "Chapter, unit, or topic name",
      "problems": "Problem numbers or description",
      "textbook": "Textbook name if specified",
      "weekOrDue": "Week number or due date if specified"
    }
  ],
  "gradingScheme": [
    {
      "name": "Component name (e.g. Assignments, Midterm 1, Final Exam)",
      "weight": 25,
      "notes": "Count, drop lowest rule, or conditions"
    }
  ]
}
Rules:
- Use empty strings "" or empty arrays [] for fields not found in the syllabus. Never fabricate dates or facts.
- Grading scheme weights must be numbers (e.g. 25 for 25%). Do not include a "Total: 100%" row.
- Classify every textbook accurately as either "required" or "suggested" (treat recommended/optional/supplementary as "suggested").
- Extract all suggested exercises, practice problems, or chapter problem sets if listed anywhere in the outline.`;

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

async function extractWithGemini(params: {
  apiKey: string;
  model: string;
  pdfBytes: Uint8Array;
  rawText: string;
  pageCount: number;
}): Promise<ExtractedSyllabus> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    params.model
  )}:generateContent?key=${encodeURIComponent(params.apiKey)}`;

  const parts: Array<Record<string, unknown>> = [
    { text: EXTRACTION_SYSTEM_PROMPT },
  ];

  // Attach the actual PDF bytes natively if under 15 MB so scanned PDFs also work!
  if (params.pdfBytes.byteLength <= 15 * 1024 * 1024) {
    parts.push({
      inline_data: {
        mime_type: "application/pdf",
        data: Buffer.from(params.pdfBytes).toString("base64"),
      },
    });
    parts.push({
      text: "Extract the course outline JSON from the attached PDF.",
    });
  } else {
    parts.push({
      text: `Extract the course outline JSON from the following syllabus text:\n\n${params.rawText.slice(
        0,
        60000
      )}`,
    });
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Gemini API error (${res.status}): ${errorBody.slice(0, 240)}`);
  }

  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const textOutput = data.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? "")
    .join("")
    .trim();

  if (!textOutput) {
    throw new Error("Gemini returned an empty response.");
  }

  const parsedJson = extractJsonObject(textOutput);
  return normalizeExtractedSyllabus(parsedJson, "gemini", [], {
    pageCount: params.pageCount,
    rawTextPreview: params.rawText.slice(0, 2500),
  });
}

async function extractWithOpenAI(params: {
  apiKey: string;
  model: string;
  rawText: string;
  pageCount: number;
}): Promise<ExtractedSyllabus> {
  if (params.rawText.trim().length < 40) {
    throw new Error(
      "No selectable text was found in this PDF for OpenAI text extraction. Use Gemini for scanned PDFs."
    );
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract the course outline JSON from this syllabus:\n\n${params.rawText.slice(
            0,
            60000
          )}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`OpenAI API error (${res.status}): ${errorBody.slice(0, 240)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("OpenAI returned an empty response.");
  }

  const parsedJson = extractJsonObject(content);
  return normalizeExtractedSyllabus(parsedJson, "openai", [], {
    pageCount: params.pageCount,
    rawTextPreview: params.rawText.slice(0, 2500),
  });
}

export interface HybridExtractOptions {
  pdfBytes: Uint8Array;
  rawText: string;
  pageCount: number;
  provider: ExtractionProvider;
  apiKey?: string;
  model?: string;
}

export async function extractSyllabusHybrid(
  options: HybridExtractOptions
): Promise<ExtractedSyllabus> {
  const { pdfBytes, rawText, pageCount, provider, apiKey, model } = options;

  const geminiKey =
    (provider === "gemini" || provider === "auto" ? apiKey?.trim() : "") ||
    process.env.GEMINI_API_KEY?.trim() ||
    "";
  const openaiKey =
    (provider === "openai" || provider === "auto" ? apiKey?.trim() : "") ||
    process.env.OPENAI_API_KEY?.trim() ||
    "";

  const geminiModel = model?.trim() || process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const openaiModel = model?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

  if (provider === "local") {
    return parseSyllabusHeuristically(rawText, { pageCount });
  }

  if (provider === "gemini") {
    if (!geminiKey) {
      return parseSyllabusHeuristically(rawText, {
        pageCount,
        extraWarnings: [
          "Gemini was selected, but no Gemini API key was provided. Fell back to the local heuristic parser.",
        ],
      });
    }
    try {
      return await extractWithGemini({
        apiKey: geminiKey,
        model: geminiModel,
        pdfBytes,
        rawText,
        pageCount,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown Gemini error";
      return parseSyllabusHeuristically(rawText, {
        pageCount,
        extraWarnings: [`Gemini extraction failed (${msg}). Fell back to local heuristic parser.`],
      });
    }
  }

  if (provider === "openai") {
    if (!openaiKey) {
      return parseSyllabusHeuristically(rawText, {
        pageCount,
        extraWarnings: [
          "OpenAI was selected, but no OpenAI API key was provided. Fell back to the local heuristic parser.",
        ],
      });
    }
    try {
      return await extractWithOpenAI({
        apiKey: openaiKey,
        model: openaiModel,
        rawText,
        pageCount,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown OpenAI error";
      return parseSyllabusHeuristically(rawText, {
        pageCount,
        extraWarnings: [`OpenAI extraction failed (${msg}). Fell back to local heuristic parser.`],
      });
    }
  }

  // Auto mode: prefer Gemini -> OpenAI -> Local heuristic
  const fallbackNotes: string[] = [];

  if (geminiKey) {
    try {
      return await extractWithGemini({
        apiKey: geminiKey,
        model: geminiModel,
        pdfBytes,
        rawText,
        pageCount,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown Gemini error";
      fallbackNotes.push(`Gemini failed (${msg}).`);
    }
  }

  if (openaiKey) {
    try {
      return await extractWithOpenAI({
        apiKey: openaiKey,
        model: openaiModel,
        rawText,
        pageCount,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown OpenAI error";
      fallbackNotes.push(`OpenAI failed (${msg}).`);
    }
  }

  return parseSyllabusHeuristically(rawText, {
    pageCount,
    extraWarnings: fallbackNotes,
  });
}
