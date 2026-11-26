import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    serverKeys: {
      gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
      openai: Boolean(process.env.OPENAI_API_KEY?.trim()),
    },
    defaultModels: {
      gemini: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
      openai: process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini",
    },
  });
}
