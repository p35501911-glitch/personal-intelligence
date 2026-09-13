import type { PersonalizedStoryItem } from "../relevance";

export interface SavedStoryItem extends PersonalizedStoryItem {
  bookmarkId: string;
  storyId: string;
  savedAt: string;
  isSaved: true;
}

export interface SavedStoriesFetchOptions {
  userId: string;
  limit?: number;
  offset?: number;
}

export interface SavedStoriesResult {
  stories: SavedStoryItem[];
  pagination: {
    limit: number;
    offset: number;
    count: number;
    hasMore: boolean;
  };
}
