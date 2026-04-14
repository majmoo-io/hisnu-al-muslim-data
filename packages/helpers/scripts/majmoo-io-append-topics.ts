import { readdir } from "node:fs/promises";
import { monorepoRoot } from "@monorepo/root";

const topicsFile = new URL(
  "packages/helpers/scripts/majmoo-topics.yml",
  monorepoRoot.url,
);
const dataDir = new URL("data/ar.al-qahtani-majmoo-io/", monorepoRoot.url);

const topicsRaw = await Bun.file(topicsFile).text();
const topicsData = Bun.YAML.parse(topicsRaw) as {
  chapter_topics: Record<string, string[]>;
};

const files = await readdir(dataDir).then((f) =>
  f.filter((f) => f.endsWith(".yaml") && f !== "000-metadata.yaml").sort(),
);

interface Chapter {
  title: string;
  chapter: number;
  topics?: string[];
  items: { parts: { type: string; text: string }[]; reference: string }[];
}

let updated = 0;

const writePromises = files.map(async (file) => {
  const raw = await Bun.file(new URL(file, dataDir)).text();
  const chapter = Bun.YAML.parse(raw) as Chapter;

  const topics = topicsData.chapter_topics[String(chapter.chapter)];
  if (!topics) {
    console.log(`  [${chapter.chapter}] No topics found, skipping`);
    return;
  }

  chapter.topics = topics;

  await Bun.write(new URL(file, dataDir), Bun.YAML.stringify(chapter, null, 2));
  console.log(`  [${chapter.chapter}] ${chapter.title} → ${topics.join(", ")}`);
  updated++;
});

await Promise.all(writePromises);

console.log(`\nDone. Updated ${updated}/${files.length} chapters.`);
