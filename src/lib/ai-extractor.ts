import { parseSyllabusFromLayout, parseSyllabusHeuristically } from "./heuristic-parser";
import type { PdfLayoutDocument } from "./pdf";
import { normalizeExtractedSyllabus } from "./schema";
import type { ExtractedSyllabus, ExtractionProvider } from "./types";

const EXTRACTION_SYSTEM_PROMPT = `You are an expert academic assistant that extracts structured data from university course outlines and syllabi.
Extract accurately according to the requested JSON schema:
- Use empty strings "" or empty arrays [] for fields not found in the syllabus. Never fabricate dates, emails, or books.
- Grading scheme weights must be numbers (e.g. 25 for 25%). Exclude "Total: 100%" summary rows and exclude letter-grade conversion tables (e.g. A+ = 90%-100%, B = 70%-79%).
- Classify every textbook accurately as either "required" or "suggested" (treat recommended/optional/supplementary/reference as "suggested"). Exclude non-textbook coursework items (like projects, quizzes, assignments, or software policies) from textbooks.
- Attach book download URLs or free-copy notes to that textbook's "notes" field rather than creating separate entries.
- Normalize exam dates to ISO YYYY-MM-DD when the exact date is known; otherwise keep the syllabus wording or "TBD".
- Extract all suggested exercises, practice problems, or chapter problem sets if listed anywhere in the outline.`;

/** Strict OpenAPI 3.0 schema for Gemini constrained decoding (`responseSchema`) */
const GEMINI_SYLLABUS_SCHEMA = {
  type: "OBJECT",
  properties: {
    courseCode: { type: "STRING", description: "Course code such as CS 301 or ELEC 264" },
    courseTitle: { type: "STRING", description: "Full course title" },
    term: { type: "STRING", description: "Academic term and year, e.g. Fall 2026" },
    department: { type: "STRING", description: "Department, school, or faculty name" },
    instructor: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        email: { type: "STRING" },
        officeLocation: { type: "STRING" },
        officeHours: { type: "STRING" },
        teachingAssistants: { type: "ARRAY", items: { type: "STRING" } },
      },
      required: ["name", "email", "officeLocation", "officeHours", "teachingAssistants"],
    },
    exams: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          date: { type: "STRING", description: "YYYY-MM-DD when exact date is known, else raw text or TBD" },
          time: { type: "STRING" },
          location: { type: "STRING" },
          weight: { type: "STRING" },
          notes: { type: "STRING" },
        },
        required: ["title", "date", "time", "location", "weight", "notes"],
      },
    },
    textbooks: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          authors: { type: "STRING" },
          edition: { type: "STRING" },
          isbn: { type: "STRING" },
          requirement: { type: "STRING", enum: ["required", "suggested"] },
          notes: { type: "STRING" },
        },
        required: ["title", "authors", "edition", "isbn", "requirement", "notes"],
      },
    },
    exercises: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          topic: { type: "STRING" },
          problems: { type: "STRING" },
          textbook: { type: "STRING" },
          weekOrDue: { type: "STRING" },
        },
        required: ["topic", "problems", "textbook", "weekOrDue"],
      },
    },
    gradingScheme: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          weight: { type: "NUMBER" },
          notes: { type: "STRING" },
        },
        required: ["name", "weight", "notes"],
      },
    },
  },
  required: [
    "courseCode",
    "courseTitle",
    "term",
    "department",
    "instructor",
    "exams",
    "textbooks",
    "exercises",
    "gradingScheme",
  ],
};

/** Standard JSON Schema for Ollama structured outputs (`format`) */
const OLLAMA_SYLLABUS_JSON_SCHEMA = {
  type: "object",
  properties: {
    courseCode: { type: "string" },
    courseTitle: { type: "string" },
    term: { type: "string" },
    department: { type: "string" },
    instructor: {
      type: "object",
      properties: {
        name: { type: "string" },
        email: { type: "string" },
        officeLocation: { type: "string" },
        officeHours: { type: "string" },
        teachingAssistants: { type: "array", items: { type: "string" } },
      },
      required: ["name", "email", "officeLocation", "officeHours", "teachingAssistants"],
    },
    exams: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          date: { type: "string" },
          time: { type: "string" },
          location: { type: "string" },
          weight: { type: "string" },
          notes: { type: "string" },
        },
        required: ["title", "date", "time", "location", "weight", "notes"],
      },
    },
    textbooks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          authors: { type: "string" },
          edition: { type: "string" },
          isbn: { type: "string" },
          requirement: { type: "string", enum: ["required", "suggested"] },
          notes: { type: "string" },
        },
        required: ["title", "authors", "edition", "isbn", "requirement", "notes"],
      },
    },
    exercises: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: { type: "string" },
          problems: { type: "string" },
          textbook: { type: "string" },
          weekOrDue: { type: "string" },
        },
        required: ["topic", "problems", "textbook", "weekOrDue"],
      },
    },
    gradingScheme: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          weight: { type: "number" },
          notes: { type: "string" },
        },
        required: ["name", "weight", "notes"],
      },
    },
  },
  required: [
    "courseCode",
    "courseTitle",
    "term",
    "department",
    "instructor",
    "exams",
    "textbooks",
    "exercises",
    "gradingScheme",
  ],
};

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

  // Attach the actual PDF bytes natively if <= 15 MB so Gemini reads tables & scanned pages visually
  if (params.pdfBytes.byteLength <= 15 * 1024 * 1024) {
    parts.push({
      inline_data: {
        mime_type: "application/pdf",
        data: Buffer.from(params.pdfBytes).toString("base64"),
      },
    });
    parts.push({
      text: "Extract the structured course outline JSON from the attached syllabus PDF.",
    });
  } else {
    parts.push({
      text: `Extract the structured course outline JSON from this syllabus:\n\n${params.rawText.slice(
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
        responseSchema: GEMINI_SYLLABUS_SCHEMA,
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
      "No selectable text was found in this PDF for OpenAI extraction. Use Gemini for scanned PDFs."
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
        {
          role: "system",
          content: `${EXTRACTION_SYSTEM_PROMPT}\n\nReturn ONLY a JSON object matching:\n${JSON.stringify(
            OLLAMA_SYLLABUS_JSON_SCHEMA.properties
          )}`,
        },
        {
          role: "user",
          content: `Extract the course outline JSON from this layout-preserved syllabus:\n\n${params.rawText.slice(
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

async function extractWithOllama(params: {
  baseUrl: string;
  model: string;
  rawText: string;
  pageCount: number;
}): Promise<ExtractedSyllabus> {
  if (params.rawText.trim().length < 40) {
    throw new Error(
      "No selectable text was found in this PDF for Ollama extraction. Use Gemini for scanned PDFs."
    );
  }

  const normalizedBase = params.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${normalizedBase}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: params.model,
      stream: false,
      format: OLLAMA_SYLLABUS_JSON_SCHEMA,
      options: { temperature: 0.1 },
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract the structured course outline JSON from this syllabus:\n\n${params.rawText.slice(
            0,
            45000
          )}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`Ollama error (${res.status}): ${errorBody.slice(0, 240)}`);
  }

  const data = (await res.json()) as {
    message?: { content?: string };
  };

  const content = data.message?.content?.trim();
  if (!content) {
    throw new Error("Ollama returned an empty response.");
  }

  const parsedJson = extractJsonObject(content);
  return normalizeExtractedSyllabus(parsedJson, "ollama", [], {
    pageCount: params.pageCount,
    rawTextPreview: params.rawText.slice(0, 2500),
  });
}

export interface HybridExtractOptions {
  pdfBytes: Uint8Array;
  layout?: PdfLayoutDocument;
  rawText: string;
  pageCount: number;
  provider: ExtractionProvider;
  apiKey?: string;
  model?: string;
  ollamaBaseUrl?: string;
}

function runOfflineFallback(
  options: HybridExtractOptions,
  extraWarnings: string[] = []
): ExtractedSyllabus {
  if (options.layout) {
    return parseSyllabusFromLayout(options.layout, extraWarnings);
  }
  return parseSyllabusHeuristically(options.rawText, {
    pageCount: options.pageCount,
    extraWarnings,
  });
}

export async function extractSyllabusHybrid(
  options: HybridExtractOptions
): Promise<ExtractedSyllabus> {
  const { pdfBytes, rawText, pageCount, provider, apiKey, model, ollamaBaseUrl } = options;

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
  const resolvedOllamaUrl =
    ollamaBaseUrl?.trim() || process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
  const resolvedOllamaModel =
    model?.trim() || process.env.OLLAMA_MODEL?.trim() || "qwen2.5:7b";

  if (provider === "local") {
    return runOfflineFallback(options);
  }

  if (provider === "ollama") {
    try {
      return await extractWithOllama({
        baseUrl: resolvedOllamaUrl,
        model: resolvedOllamaModel,
        rawText,
        pageCount,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not reach Ollama";
      return runOfflineFallback(options, [
        `Ollama (${resolvedOllamaModel} at ${resolvedOllamaUrl}) failed: ${msg}. Fell back to the layout-aware offline parser.`,
      ]);
    }
  }

  if (provider === "gemini") {
    if (!geminiKey) {
      return runOfflineFallback(options, [
        "Gemini was selected, but no Gemini API key was provided. Fell back to the layout-aware offline parser.",
      ]);
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
      return runOfflineFallback(options, [
        `Gemini extraction failed (${msg}). Fell back to the layout-aware offline parser.`,
      ]);
    }
  }

  if (provider === "openai") {
    if (!openaiKey) {
      return runOfflineFallback(options, [
        "OpenAI was selected, but no OpenAI API key was provided. Fell back to the layout-aware offline parser.",
      ]);
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
      return runOfflineFallback(options, [
        `OpenAI extraction failed (${msg}). Fell back to the layout-aware offline parser.`,
      ]);
    }
  }

  // Auto mode: Gemini -> OpenAI -> Ollama (if configured via OLLAMA_MODEL env) -> Layout-aware offline parser
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

  if (process.env.OLLAMA_MODEL?.trim()) {
    try {
      return await extractWithOllama({
        baseUrl: resolvedOllamaUrl,
        model: process.env.OLLAMA_MODEL.trim(),
        rawText,
        pageCount,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown Ollama error";
      fallbackNotes.push(`Ollama failed (${msg}).`);
    }
  }

  return runOfflineFallback(options, fallbackNotes);
}
