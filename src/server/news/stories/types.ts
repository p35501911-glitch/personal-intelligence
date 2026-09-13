export interface Story {
  id: string;
  canonicalTitle: string;
  summary: string | null;
  firstPublishedAt: Date;
  latestPublishedAt: Date;
  articleCount: number;
  sourceCount: number;
  importanceScore: number | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoryCandidate {
  id: string;
  canonicalTitle: string;
  firstPublishedAt: Date;
  latestPublishedAt: Date;
  articleCount: number;
  sourceCount: number;
}

export interface ClusterArticleResult {
  articleId: string;
  storyId: string;
  isNewStory: boolean;
  canonicalTitle: string;
}

export interface StoryFetchOptions {
  limit?: number;
  offset?: number;
  status?: string;
  categoryId?: string;
}
