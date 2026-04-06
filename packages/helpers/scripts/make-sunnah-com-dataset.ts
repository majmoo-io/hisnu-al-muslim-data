/**
 * Makes the sunnah.com dataset by scraping and parsing the html 
 */
import * as cheerio from "cheerio";
import { monorepoRoot } from '@monorepo/root'


const sourceFilePath = new URL('./sunnah-com-hisnu-al-muslim.html', import.meta.url)
const outputDirectory = new URL("data/ar.al-qahtani/", monorepoRoot.url);

const html = await Bun.file(sourceFilePath).text();

const $ = cheerio.load(html);

const chapterMap = new Map(
  $(".chapter_link")
    .toArray()
    .map((el) => {
      const chapter = $(el).find(".chapter_number").text().trim();
      const chapterNumber = Number(chapter.replace(/[()]/g, ""));
      const title = $(el)
        .find(".english")
        .text()
        .trim()
        .toLowerCase()
        .replace(/[^a-zA-Z0-9 ]/g, "")
        .replace(/\s+/g, "-");
      return [chapterNumber, title];
    }),
); 

const promises = $(".chapter")
  .toArray()
  .map(async (el) => {
    const chapter = $(el).find(".echapno").text().trim();
    const chapterNumber = Number(chapter.replace(/[()]/g, ""));

    const arabicTitle = $(el).find(".arabicchapter").text().trim();

    const chapterItems = $(el)
      .nextUntil(".chapter")
      .filter(".actualHadithContainer")
      .toArray()
      .map((content) => {
        const $content = $(content);
        const parsedTextParts: {
          type: "zikr" | "instruction";
          text: string;
        }[] = [];

        // 1. Try our mixed-content logic first
        $content
          .find(".arabic_text_details")
          .contents()
          .each((_, node) => {
            const $node = $(node);

            if (
              node.type === "tag" &&
              $node.hasClass("hisn_arabic_instructions")
            ) {
              // Replace newlines with spaces, collapse multiple spaces, and trim
              const instructionText = $node
                .text()
                .replace(/\n/g, " ")
                .replace(/\s+/g, " ")
                .trim();
              if (instructionText) {
                parsedTextParts.push({
                  type: "instruction",
                  text: instructionText,
                });
              }
            } else {
              // Same newline clean-up for the Zikr text
              const zikrText = $node
                .text()
                .replace(/\n/g, " ")
                .replace(/\s+/g, " ")
                .trim();
              if (zikrText) {
                const lastItem = parsedTextParts[parsedTextParts.length - 1];
                if (lastItem && lastItem.type === "zikr") {
                  lastItem.text += " " + zikrText;
                } else {
                  parsedTextParts.push({ type: "zikr", text: zikrText });
                }
              }
            }
          });

        // 2. THE SAFETY NET: If the array is STILL empty, fallback to the original selector
        // This catches items (like Item 4) where developers forgot to include the .arabic_text_details wrapper
        if (parsedTextParts.length === 0) {
          const fallbackText = $content
            .find(".arabic_hadith_full")
            .text()
            .replace(/\n/g, " ")
            .replace(/\s+/g, " ")
            .trim();

          if (fallbackText) {
            parsedTextParts.push({ type: "zikr", text: fallbackText });
          }
        }

        return {
          parts: parsedTextParts,
          reference: $content
            .find(".hisn_english_reference")
            .text()
            .replace(/\n/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
        };
      });

    const fileName = `${String(chapterNumber).padStart(3, "0")}-${chapterMap.get(chapterNumber)}.yaml`;

    const chapterContent = {
      title: arabicTitle,
      chapter: chapterNumber,
      items: chapterItems,
    };

    const outputPath = new URL(fileName, outputDirectory);
    await Bun.file(outputPath).write(
      Bun.YAML.stringify(chapterContent, null, 2),
    );
  });

await Promise.all(promises);
