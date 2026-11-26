import { NextResponse } from "next/server";

export const runtime = "nodejs";

async function probeOllama(baseUrl: string): Promise<{ available: boolean; models: string[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 600);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/tags`, {
      signal: controller.signal,
    });
    if (!res.ok) return { available: false, models: [] };
    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    const models = (data.models ?? [])
      .map((m) => m.name ?? "")
      .filter(Boolean);
    return { available: true, models };
  } catch {
    return { available: false, models: [] };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL?.trim() || "http://127.0.0.1:11434";
  const ollamaStatus = await probeOllama(ollamaBaseUrl);

  return NextResponse.json({
    serverKeys: {
      gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
      openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
    },
    ollama: {
      available: ollamaStatus.available,
      baseUrl: ollamaBaseUrl,
      models: ollamaStatus.models,
    },
    defaultModels: {
      gemini: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
      openai: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
      ollama: process.env.OLLAMA_MODEL?.trim() || ollamaStatus.models[0] || "qwen2.5:7b",
    },
  });
}
