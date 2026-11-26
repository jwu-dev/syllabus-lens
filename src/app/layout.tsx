import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SyllabusLens — Course Outline PDF Extractor & Planner",
  description:
    "Upload course outline PDFs to extract instructor details, exam dates, required & suggested textbooks, practice exercises, and grading schemes.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 font-sans text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
