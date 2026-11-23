// Dunne laag om het model heen: één functie, injecteerbaar in tests.
// Zonder ANTHROPIC_API_KEY is er geen client; elke stap die een model nodig
// heeft slaat dan netjes over (droge run).
import Anthropic from "@anthropic-ai/sdk";

export interface ModelAanroep {
  model: string;
  system: string;
  user: string;
  maxTokens: number;
}
export interface ModelClient {
  tekst(a: ModelAanroep): Promise<string>;
}

export function maakModelClient(timeoutMs = 45000): ModelClient | null {
  const sleutel = process.env.ANTHROPIC_API_KEY;
  if (!sleutel) return null;
  const client = new Anthropic({ apiKey: sleutel, timeout: timeoutMs, maxRetries: 1 });
  return {
    async tekst(a) {
      const r = await client.messages.create({
        model: a.model,
        max_tokens: a.maxTokens,
        system: a.system,
        messages: [{ role: "user", content: a.user }],
      });
      if (r.stop_reason === "refusal") throw new Error("Model weigerde de aanvraag.");
      const t = r.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("")
        .trim();
      if (!t) throw new Error(`Leeg modelantwoord (stop_reason=${r.stop_reason}).`);
      return t;
    },
  };
}

/** Eerste JSON-object (of array) in een modelantwoord, ook als het in code-hekken staat. */
export function haalJson<T = unknown>(ruw: string): T | null {
  const s = String(ruw || "").replace(/```(?:json)?/gi, "").trim();
  const start = s.search(/[\[{]/);
  if (start < 0) return null;
  const open = s[start];
  const sluit = open === "{" ? "}" : "]";
  const eind = s.lastIndexOf(sluit);
  if (eind <= start) return null;
  try {
    return JSON.parse(s.slice(start, eind + 1)) as T;
  } catch {
    return null;
  }
}
