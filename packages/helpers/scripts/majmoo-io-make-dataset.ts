/**
 * Derives the majmoo.io dataset from the sunnah.com dataset.
 * Uses Gemini to vocalize Arabic text with full tashkeel.
 */
import { mkdir, readdir } from "node:fs/promises";
import { GoogleGenAI, Type } from "@google/genai";
import { monorepoRoot } from "@monorepo/root";

const inputDir = new URL("data/ar.al-qahtani-sunnah-com/", monorepoRoot.url);
const outputDir = new URL("data/ar.al-qahtani-majmoo-io/", monorepoRoot.url);

await mkdir(outputDir, { recursive: true });

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

interface Part {
  type: "zikr" | "instruction";
  text: string;
}

interface Chapter {
  title: string;
  chapter: number;
  items: { parts: Part[]; reference: string }[];
}

async function processChapter(chapter: Chapter) {
  const zikrTexts: string[] = [];
  for (const item of chapter.items) {
    for (const part of item.parts) {
      if (part.type === "zikr") zikrTexts.push(part.text);
    }
  }

  const numbered = zikrTexts.map((t, i) => `${i + 1}. ${t}`).join("\n");

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `You are processing chapters from "Hisn al-Muslim" (حصن المسلم — Fortress of the Muslim) by Sa'id ibn Ali ibn Wahf al-Qahtani. This is a well-known Islamic du'a and adhkar book organized into chapters, each containing supplications (du'as) and remembrances (adhkar) for various occasions in a Muslim's daily life.
        Chapter title: ${chapter.title}
        Chapter number: ${chapter.chapter}
        Total zikr count: ${zikrTexts.length}

        Zikr texts:
        ${numbered}

        Instructions:
        For each zikr text, provide the fully vocalized version with complete Arabic diacritics (tashkeel). Preserve the original words exactly — only add or correct diacritics. You MUST return exactly ${zikrTexts.length} vocalized texts, one for each input — do not split or merge entries.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          vocalized_texts: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["vocalized_texts"],
      },
    },
  });

  const result = JSON.parse(response.text ?? "{}") as {
    vocalized_texts: string[];
  };

  if (result.vocalized_texts.length !== zikrTexts.length) {
    console.warn(
      `  ⚠ chapter ${chapter.chapter}: expected ${zikrTexts.length} vocalized texts, got ${result.vocalized_texts.length}`,
    );
  }

  // Apply vocalizations back onto the chapter items
  let idx = 0;
  const items = chapter.items.map((item) => ({
    ...item,
    parts: item.parts.map((part) =>
      part.type === "zikr"
        ? { ...part, text: result.vocalized_texts[idx++] ?? part.text }
        : part,
    ),
  }));

  return {
    title: chapter.title,
    chapter: chapter.chapter,
    items,
  };
}

const files = await readdir(inputDir).then((f) =>
  f.filter((f) => f.endsWith(".yaml") && f !== "000-metadata.yaml").sort(),
);

console.log(`Processing ${files.length} chapters...`);

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

for (const file of files) {
  const raw = await Bun.file(new URL(file, inputDir)).text();
  const chapter = Bun.YAML.parse(raw) as Chapter;

  console.log(`  [${chapter.chapter}] ${chapter.title}`);

  const output = await processChapter(chapter);
  await Bun.write(
    new URL(file, outputDir),
    Bun.YAML.stringify(output, null, 2),
  );

  await delay(4000);
}

console.log("Done.");
