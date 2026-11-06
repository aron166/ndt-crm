import "server-only";
import Groq from "groq-sdk";

// The Groq free-tier setup the enrichment pipeline and the call analysis share.

export const GROQ_MODEL = "llama-3.3-70b-versatile";

/** A client for GROQ_API_KEY, or null when the key is not set. */
export function groqFromEnv(): Groq | null {
  const apiKey = process.env.GROQ_API_KEY;
  return apiKey ? new Groq({ apiKey }) : null;
}

/** The model sometimes wraps its JSON in a ```json fence; drop it. */
export function stripJsonFence(raw: string): string {
  return raw.replace(/^```json?\n?/i, "").replace(/\n?```$/i, "").trim();
}
