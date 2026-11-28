// Maakt de illustraties uit illustraties/opdrachten.json met een Google-beeldmodel.
// Draait alleen in GitHub Actions (secret GEMINI_API_KEY). Bestaande beelden worden
// overgeslagen, dus opnieuw draaien kost niets extra. Een mislukt beeld stopt de rest niet.
import { readFile, writeFile, access } from "node:fs/promises";

const sleutel = (process.env.GEMINI_API_KEY || "").trim();
const model = (process.env.BEELD_MODEL || "gemini-nano-banana-2.1").trim();
if (!sleutel) {
  console.log("Geen GEMINI_API_KEY: niets gemaakt.");
  process.exit(0);
}
const { stijl, beelden } = JSON.parse(await readFile("illustraties/opdrachten.json", "utf8"));
let gemaakt = 0, mislukt = 0;
for (const b of beelden) {
  const pad = `public/illustraties/${b.id}.png`;
  try { await access(pad); continue; } catch {}
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": sleutel },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${b.beeld}\n\n${stijl}` }] }],
        generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "16:9" } },
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${JSON.stringify(d).slice(0, 300)}`);
    const deel = (d.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
    if (!deel) throw new Error(`geen beeld in antwoord: ${JSON.stringify(d).slice(0, 300)}`);
    await writeFile(pad, Buffer.from(deel.inlineData.data, "base64"));
    gemaakt += 1;
    console.log(`gemaakt: ${b.id}`);
  } catch (e) {
    mislukt += 1;
    console.log(`MISLUKT ${b.id}: ${e.message}`);
  }
}
console.log(`klaar: ${gemaakt} gemaakt, ${mislukt} mislukt, model ${model}`);
