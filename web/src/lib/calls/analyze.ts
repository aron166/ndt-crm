import "server-only";
import { GROQ_MODEL, groqFromEnv } from "@/lib/groq";
import { reportError } from "@/lib/report-error";

// Server-side AI analysis of a call transcript. Reuses the same Groq free-tier
// model the enrichment pipeline uses (lib/groq.ts). Best-effort: if
// the key is missing or Groq errors, we return null and the caller stores the
// raw transcript anyway — analysis must never block recording the call.

const SYSTEM_PROMPT = `Te egy magyar NDT (roncsolásmentes anyagvizsgálat) értékesítési hívásokat elemző asszisztens vagy.
A felhasználó egy telefonhívás átiratát adja meg. Foglald össze RÖVIDEN, magyarul, pontosan az alábbi szerkezetben:

Összefoglaló: 1-2 mondat a hívásról.
Eredmény: a hívás kimenetele / az ügyfél hangulata.
Teendők: konkrét következő lépések felsorolása (ha nincs, írd: "nincs").

Csak az átiratban szereplő tényekből dolgozz. Ne találj ki semmit. Ne használj markdownt.`;

export async function analyzeCallTranscript(transcript: string): Promise<string | null> {
  const groq = groqFromEnv();
  if (!groq || !transcript.trim()) return null;
  try {
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: transcript.slice(0, 12_000) },
      ],
      temperature: 0.2,
      max_tokens: 400,
    });
    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    // Best effort: the call is still recorded without the summary.
    reportError("calls.analyzeTranscript", err);
    return null;
  }
}
