import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import {
  getNextSelectedIndex,
  getPreviousSelectedIndex,
  isEditableTarget,
  BookmarkDebounceGuard,
  interpretFeedKeyboardEvent,
  resolveSelectedStoryIndex,
  type FeedKeyEvent,
} from "@/components/feed/keyboard-navigation";
import type { PersonalizedStoryItem } from "@/server/news/relevance";

// Load test environment
const localEnvPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

// Sample mock stories including stories with and without precomputed AI intelligence
const MOCK_STORIES: PersonalizedStoryItem[] = [
  {
    id: "story-1",
    title: "Breakthrough Topological Quantum Processor",
    canonicalTitle: "Breakthrough Topological Quantum Processor",
    summary: "Researchers demonstrate fault-tolerant logical qubits at scale.",
    imageUrl: null,
    firstPublishedAt: new Date(Date.now() - 3600000).toISOString(),
    latestPublishedAt: new Date().toISOString(),
    articleCount: 6,
    sourceCount: 4,
    importance: "CRITICAL",
    importanceScore: 0.94,
    categories: [
      {
        categoryId: "quantum-computing",
        categorySlug: "quantum-computing",
        categoryName: "Quantum Computing",
        isPrimary: true,
        level: 3,
        confidence: 0.96,
      },
    ],
    sources: [{ id: "src-1", name: "MIT Tech Review", url: "https://example.com/1" }],
    status: "active",
    isSaved: false,
    relevance: {
      score: 0.92,
      isRelevant: true,
      matchedCategoryIds: ["quantum-computing"],
      matchedCategoryNames: ["Quantum Computing"],
      synergyBoost: 0,
      recencyFactor: 1,
      explanation: "",
    },
    feedScore: 0.92,
    intelligence: {
      summary: "Quantum breakthrough with 100 logical qubits.",
      keyPoints: ["Breakthrough in topological error correction."],
      whyItMatters: "Brings commercial quantum timeline forward.",
      opportunities: ["Material science simulations"],
      risks: ["Legacy encryption risks"],
      model: "gemini-flash-latest",
      tier: "important",
      generatedAt: new Date().toISOString(),
    },
  },
  {
    id: "story-2",
    title: "Open Weights Mixture-of-Agents Frontier Model",
    canonicalTitle: "Open Weights Mixture-of-Agents Frontier Model",
    summary: "New sovereign open-source reasoning model matches proprietary benchmarks.",
    imageUrl: null,
    firstPublishedAt: new Date(Date.now() - 7200000).toISOString(),
    latestPublishedAt: new Date(Date.now() - 3600000).toISOString(),
    articleCount: 10,
    sourceCount: 5,
    importance: "HIGH",
    importanceScore: 0.89,
    categories: [
      {
        categoryId: "ai-models",
        categorySlug: "ai-models",
        categoryName: "AI Models & Architectures",
        isPrimary: true,
        level: 3,
        confidence: 0.92,
      },
    ],
    sources: [{ id: "src-2", name: "ArXiv Digest", url: "https://example.com/2" }],
    status: "active",
    isSaved: true,
    relevance: {
      score: 0.88,
      isRelevant: true,
      matchedCategoryIds: ["ai-models"],
      matchedCategoryNames: ["AI Models & Architectures"],
      synergyBoost: 0,
      recencyFactor: 1,
      explanation: "",
    },
    feedScore: 0.88,
    // Story with null intelligence to test graceful missing-intelligence handling
    intelligence: null,
  },
  {
    id: "story-3",
    title: "Photonic Co-Packaged Optics in Frontier Datacentres",
    canonicalTitle: "Photonic Co-Packaged Optics in Frontier Datacentres",
    summary: "Silicon photonics reduce interconnect power consumption by 40%.",
    imageUrl: null,
    firstPublishedAt: new Date(Date.now() - 10800000).toISOString(),
    latestPublishedAt: new Date(Date.now() - 7200000).toISOString(),
    articleCount: 4,
    sourceCount: 3,
    importance: "MEDIUM",
    importanceScore: 0.67,
    categories: [
      {
        categoryId: "semiconductors",
        categorySlug: "semiconductors",
        categoryName: "Semiconductors & Compute",
        isPrimary: true,
        level: 2,
        confidence: 0.82,
      },
    ],
    sources: [{ id: "src-3", name: "SemiEngineering", url: "https://example.com/3" }],
    status: "active",
    isSaved: false,
    relevance: {
      score: 0.72,
      isRelevant: true,
      matchedCategoryIds: ["semiconductors"],
      matchedCategoryNames: ["Semiconductors & Compute"],
      synergyBoost: 0,
      recencyFactor: 1,
      explanation: "",
    },
    feedScore: 0.72,
    intelligence: {
      summary: "Silicon photonics scale datacentre interconnects.",
      keyPoints: ["40% power reduction in AI clusters."],
      whyItMatters: "Lowers datacentre thermal load.",
      opportunities: ["Photonic chip packaging"],
      risks: ["Yield rate scaling"],
      model: "gemini-flash-lite-latest",
      tier: "normal",
      generatedAt: new Date().toISOString(),
    },
  },
];

test("Feed Keyboard Navigation & UX Comprehensive Test Suite", async (t) => {
  await t.test("1. 'j' moves selection to next story", () => {
    let index = 0;
    const total = MOCK_STORIES.length;

    index = getNextSelectedIndex(index, total);
    assert.strictEqual(index, 1);

    index = getNextSelectedIndex(index, total);
    assert.strictEqual(index, 2);

    const event: FeedKeyEvent = { key: "j", target: null };
    const action = interpretFeedKeyboardEvent(event, { hasStories: true, isModalOpen: false });
    assert.strictEqual(action.type, "SELECT_NEXT");
  });

  await t.test("2. 'k' moves selection to previous story", () => {
    let index = 2;
    const total = MOCK_STORIES.length;

    index = getPreviousSelectedIndex(index, total);
    assert.strictEqual(index, 1);

    index = getPreviousSelectedIndex(index, total);
    assert.strictEqual(index, 0);

    const event: FeedKeyEvent = { key: "k", target: null };
    const action = interpretFeedKeyboardEvent(event, { hasStories: true, isModalOpen: false });
    assert.strictEqual(action.type, "SELECT_PREVIOUS");
  });

  await t.test("3. Boundary behavior at first and last story", () => {
    const total = MOCK_STORIES.length;

    // Moving forward at end remains at last index
    const atLast = getNextSelectedIndex(total - 1, total);
    assert.strictEqual(atLast, total - 1, "Next at last story must not exceed total - 1");

    // Moving backward at start remains at 0
    const atFirst = getPreviousSelectedIndex(0, total);
    assert.strictEqual(atFirst, 0, "Prev at first story must not go below 0");

    // Initial navigation from unselected (-1) starts at 0
    assert.strictEqual(getNextSelectedIndex(-1, total), 0);
    assert.strictEqual(getPreviousSelectedIndex(-1, total), 0);

    // Empty list gracefully yields -1
    assert.strictEqual(getNextSelectedIndex(0, 0), -1);
    assert.strictEqual(getPreviousSelectedIndex(0, 0), -1);
  });

  await t.test("4. Enter opens the selected story in StoryDetailModal", () => {
    let prevented = false;
    const event: FeedKeyEvent = {
      key: "Enter",
      target: null,
      preventDefault: () => {
        prevented = true;
      },
    };

    const action = interpretFeedKeyboardEvent(event, { hasStories: true, isModalOpen: false });
    assert.strictEqual(action.type, "OPEN_SELECTED");
    assert.strictEqual(prevented, true);
  });

  await t.test("5. 'o' opens the selected story in StoryDetailModal", () => {
    let prevented = false;
    const event: FeedKeyEvent = {
      key: "o",
      target: null,
      preventDefault: () => {
        prevented = true;
      },
    };

    const action = interpretFeedKeyboardEvent(event, { hasStories: true, isModalOpen: false });
    assert.strictEqual(action.type, "OPEN_SELECTED");
    assert.strictEqual(prevented, true);
  });

  await t.test("6. Esc closes StoryDetailModal and restores feed continuity", () => {
    let prevented = false;
    const event: FeedKeyEvent = {
      key: "Escape",
      target: null,
      preventDefault: () => {
        prevented = true;
      },
    };

    const action = interpretFeedKeyboardEvent(event, { isModalOpen: true, hasStories: true });
    assert.strictEqual(action.type, "CLOSE_MODAL");
    assert.strictEqual(prevented, true);
  });

  await t.test("7. 's' toggles save on the selected story", () => {
    let prevented = false;
    const event: FeedKeyEvent = {
      key: "s",
      target: null,
      preventDefault: () => {
        prevented = true;
      },
    };

    const action = interpretFeedKeyboardEvent(event, { hasStories: true, isModalOpen: false });
    assert.strictEqual(action.type, "TOGGLE_BOOKMARK");
    assert.strictEqual(prevented, true);
  });

  await t.test("8. Shortcuts are strictly ignored inside inputs, textareas, selects, and contenteditable", () => {
    const inputTarget = { tagName: "INPUT" };
    const textareaTarget = { tagName: "TEXTAREA" };
    const selectTarget = { tagName: "SELECT" };
    const contentEditableTarget = { tagName: "DIV", isContentEditable: true };
    const roleTextbox = {
      tagName: "DIV",
      getAttribute: (attr: string) => (attr === "role" ? "textbox" : null),
    };

    assert.strictEqual(isEditableTarget(inputTarget), true);
    assert.strictEqual(isEditableTarget(textareaTarget), true);
    assert.strictEqual(isEditableTarget(selectTarget), true);
    assert.strictEqual(isEditableTarget(contentEditableTarget), true);
    assert.strictEqual(isEditableTarget(roleTextbox), true);

    const keys = ["j", "k", "Enter", "o", "s", "Escape"];
    for (const key of keys) {
      const event: FeedKeyEvent = { key, target: inputTarget };
      assert.strictEqual(
        interpretFeedKeyboardEvent(event, { hasStories: true, isModalOpen: false }).type,
        "IGNORE",
        `Key ${key} must be ignored in form controls`
      );
    }
  });

  await t.test("9. When StoryDetailModal is open, j/k navigates next/prev story seamlessly", () => {
    const eventJ: FeedKeyEvent = { key: "j", target: null };
    const actionJ = interpretFeedKeyboardEvent(eventJ, { isModalOpen: true, hasStories: true });
    assert.strictEqual(actionJ.type, "MODAL_NEXT");

    const eventK: FeedKeyEvent = { key: "k", target: null };
    const actionK = interpretFeedKeyboardEvent(eventK, { isModalOpen: true, hasStories: true });
    assert.strictEqual(actionK.type, "MODAL_PREVIOUS");

    // S also toggles bookmark while modal is open
    const eventS: FeedKeyEvent = { key: "s", target: null };
    const actionS = interpretFeedKeyboardEvent(eventS, { isModalOpen: true, hasStories: true });
    assert.strictEqual(actionS.type, "TOGGLE_BOOKMARK");
  });

  await t.test("10. Native browser shortcuts with Ctrl, Meta, or Alt are never intercepted", () => {
    const browserShortcuts: FeedKeyEvent[] = [
      { key: "j", target: null, ctrlKey: true },
      { key: "k", target: null, metaKey: true },
      { key: "o", target: null, ctrlKey: true },
      { key: "s", target: null, ctrlKey: true },
      { key: "j", target: null, altKey: true },
    ];

    for (const event of browserShortcuts) {
      assert.strictEqual(
        interpretFeedKeyboardEvent(event, { hasStories: true, isModalOpen: false }).type,
        "IGNORE",
        "Browser shortcuts must not be blocked"
      );
    }
  });

  await t.test("11. Selected story remains valid and stable after feed updates/refreshes", () => {
    const initialStories = [...MOCK_STORIES];
    const targetStory = initialStories[1]; // story-2
    const selectedId = targetStory.id;

    // Simulate feed refresh returning the same stories with updated relevance scores
    const refreshedStories = initialStories.map((s) => ({ ...s, feedScore: s.feedScore + 0.05 }));

    const resolved = resolveSelectedStoryIndex(selectedId, refreshedStories, 1);
    assert.strictEqual(resolved.storyId, "story-2");
    assert.strictEqual(resolved.index, 1);

    // Simulate story being re-ordered to index 0 after re-ranking
    const reorderedStories = [initialStories[1], initialStories[0], initialStories[2]];
    const resolvedReordered = resolveSelectedStoryIndex(selectedId, reorderedStories, 1);
    assert.strictEqual(resolvedReordered.storyId, "story-2");
    assert.strictEqual(resolvedReordered.index, 0, "Finds story at its new position after reordering");

    // Simulate selected story disappearing after category filter change
    const filteredStories = [initialStories[0], initialStories[2]]; // story-2 is removed
    const resolvedMissing = resolveSelectedStoryIndex(selectedId, filteredStories, 1);
    assert.strictEqual(resolvedMissing.storyId, null, "Resets safely when selected story disappears");
    assert.strictEqual(resolvedMissing.index, -1);
  });

  await t.test("12. Stories missing AI intelligence do not break navigation or modal display", () => {
    const storyWithoutAi = MOCK_STORIES[1];
    assert.strictEqual(storyWithoutAi.intelligence, null);

    // Navigating to story without AI works cleanly
    const idx = 1;
    assert.strictEqual(MOCK_STORIES[idx].id, "story-2");

    // Next navigation from story without AI proceeds safely
    const nextIdx = getNextSelectedIndex(idx, MOCK_STORIES.length);
    assert.strictEqual(nextIdx, 2);
    assert.ok(MOCK_STORIES[nextIdx].intelligence);

    // Prev navigation from story without AI proceeds safely
    const prevIdx = getPreviousSelectedIndex(idx, MOCK_STORIES.length);
    assert.strictEqual(prevIdx, 0);
    assert.ok(MOCK_STORIES[prevIdx].intelligence);
  });

  await t.test("13. Existing bookmark behavior and debounce concurrency protection remain intact", () => {
    const guard = new BookmarkDebounceGuard();
    const storyId = "story-1";

    // Rapid bookmark keypresses are debounced
    assert.strictEqual(guard.acquire(storyId), true, "First bookmark press acquires lock");
    assert.strictEqual(guard.acquire(storyId), false, "Second rapid keypress is rejected");
    assert.strictEqual(guard.isInFlight(storyId), true);

    // Lock is released once operation finishes
    guard.release(storyId);
    assert.strictEqual(guard.isInFlight(storyId), false);
    assert.strictEqual(guard.acquire(storyId), true, "Can bookmark again after release");
    guard.release(storyId);
  });
});
