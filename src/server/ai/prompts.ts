import type { StoryInputForAI } from "./types";

export const CURRENT_AI_PROMPT_VERSION = 1;

/**
 * System instruction defining the persona and constraints for the intelligence analyst.
 */
export const GEMINI_SYSTEM_INSTRUCTION = `You are a high-level strategic intelligence analyst for a Personal Intelligence platform.
Your objective is to analyze real-world news stories from multiple publishers and produce executive intelligence summaries.

Guidelines:
1. Executive Summary: Provide an objective, concise synthesis of the core event (2 to 4 sentences).
2. Key Points: Extract 2 to 5 crucial facts, decisions, or developments.
3. Why It Matters: Explain the broader strategic significance, economic impact, or industry consequence in 1 to 2 sentences.
4. Opportunities: Identify 1 to 3 tangible opportunities created by this event (commercial, technological, operational).
5. Risks: Identify 1 to 3 risks, uncertainties, or adverse outcomes to watch out for.
6. Tone: Highly analytical, clear, professional, unbiased. Avoid hype, fluff, and unnecessary filler.
7. Return strictly structured JSON matching the provided schema.`;

/**
 * Builds a token-efficient prompt containing only necessary metadata and summary snippets.
 */
export function buildStoryPrompt(story: StoryInputForAI): string {
  const parts: string[] = [];

  parts.push(`HEADLINE EVENT: ${story.canonicalTitle}`);

  if (story.categories && story.categories.length > 0) {
    const cats = story.categories.map((c) => c.categoryName).join(", ");
    parts.push(`TOPICS/CATEGORIES: ${cats}`);
  }

  if (story.sources && story.sources.length > 0) {
    const publishers = story.sources.map((s) => s.name).join(", ");
    parts.push(`REPORTING PUBLISHERS (${story.sources.length}): ${publishers}`);
  }

  if (story.latestPublishedAt) {
    parts.push(`DATE: ${story.latestPublishedAt}`);
  }

  if (story.summary) {
    parts.push(`PREVIEW SYNOPSIS: ${story.summary.slice(0, 300)}`);
  }

  if (story.articlesPreview && story.articlesPreview.length > 0) {
    parts.push(`REPORTS SUMMARY:`);
    story.articlesPreview.slice(0, 3).forEach((art) => {
      const pub = art.publisher ? `[${art.publisher}] ` : "";
      const textSnippet = (art.description || art.content || "")
        .replace(/<[^>]*>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 250);
      parts.push(`- ${pub}${art.title}${textSnippet ? `: ${textSnippet}` : ""}`);
    });
  }

  parts.push(`\nProduce the structured strategic intelligence JSON analysis for this story.`);

  return parts.join("\n");
}
