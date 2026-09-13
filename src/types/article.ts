import { z } from 'zod';

export const normalizedArticleSchema = z.object({
  title: z.string().min(1, 'Title cannot be empty').trim(),
  description: z.string().nullable().default(null),
  content: z.string().nullable().default(null),
  url: z.string().url('Invalid article URL'),
  imageUrl: z.string().url().nullable().default(null),
  author: z.string().nullable().default(null),
  publishedAt: z.coerce.date(),
  sourceName: z.string().min(1, 'Source name required').trim(),
  sourceUrl: z.string().url().nullable().default(null),
  externalId: z.string().min(1, 'External ID required').trim(),
  language: z.string().default('en'),
  rawData: z.record(z.string(), z.unknown()).optional(),
});

export type NormalizedArticle = z.infer<typeof normalizedArticleSchema>;

export interface ArticleSource {
  id: string;
  name: string;
  url: string;
  provider: string;
  is_active: boolean;
  created_at?: string;
}
