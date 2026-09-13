export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          parent_id: string | null;
          level: number;
          icon: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          parent_id?: string | null;
          level: number;
          icon?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          parent_id?: string | null;
          level?: number;
          icon?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_preferences: {
        Row: {
          user_id: string;
          category_selection_mode: "CATEGORY" | "ALL";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          category_selection_mode?: "CATEGORY" | "ALL";
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          category_selection_mode?: "CATEGORY" | "ALL";
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_category_preferences: {
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          category_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      sources: {
        Row: {
          id: string;
          provider: string;
          external_id: string;
          name: string;
          url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          provider: string;
          external_id: string;
          name: string;
          url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          provider?: string;
          external_id?: string;
          name?: string;
          url?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      articles: {
        Row: {
          id: string;
          source_id: string | null;
          provider: string;
          external_id: string;
          title: string;
          normalized_title: string | null;
          description: string | null;
          content: string | null;
          url: string;
          canonical_url: string | null;
          image_url: string | null;
          author: string | null;
          published_at: string;
          fetched_at: string;
          language: string | null;
          raw_data: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source_id?: string | null;
          provider: string;
          external_id: string;
          title: string;
          normalized_title?: string | null;
          description?: string | null;
          content?: string | null;
          url: string;
          canonical_url?: string | null;
          image_url?: string | null;
          author?: string | null;
          published_at: string;
          fetched_at?: string;
          language?: string | null;
          raw_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          source_id?: string | null;
          provider?: string;
          external_id?: string;
          title?: string;
          normalized_title?: string | null;
          description?: string | null;
          content?: string | null;
          url?: string;
          canonical_url?: string | null;
          image_url?: string | null;
          author?: string | null;
          published_at?: string;
          fetched_at?: string;
          language?: string | null;
          raw_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stories: {
        Row: {
          id: string;
          canonical_title: string;
          summary: string | null;
          first_published_at: string;
          latest_published_at: string;
          article_count: number;
          source_count: number;
          importance_score: number | null;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          canonical_title: string;
          summary?: string | null;
          first_published_at: string;
          latest_published_at: string;
          article_count?: number;
          source_count?: number;
          importance_score?: number | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          canonical_title?: string;
          summary?: string | null;
          first_published_at?: string;
          latest_published_at?: string;
          article_count?: number;
          source_count?: number;
          importance_score?: number | null;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      story_articles: {
        Row: {
          story_id: string;
          article_id: string;
          created_at: string;
        };
        Insert: {
          story_id: string;
          article_id: string;
          created_at?: string;
        };
        Update: {
          story_id?: string;
          article_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      article_categories: {
        Row: {
          article_id: string;
          category_id: string;
          confidence: number;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          article_id: string;
          category_id: string;
          confidence?: number;
          is_primary?: boolean;
          created_at?: string;
        };
        Update: {
          article_id?: string;
          category_id?: string;
          confidence?: number;
          is_primary?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      story_categories: {
        Row: {
          story_id: string;
          category_id: string;
          confidence: number;
          is_primary: boolean;
          created_at: string;
        };
        Insert: {
          story_id: string;
          category_id: string;
          confidence?: number;
          is_primary?: boolean;
          created_at?: string;
        };
        Update: {
          story_id?: string;
          category_id?: string;
          confidence?: number;
          is_primary?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      story_intelligence: {
        Row: {
          id: string;
          story_id: string;
          model: string;
          prompt_version: number;
          tier: "normal" | "important";
          summary: string;
          key_points: Json;
          why_it_matters: string;
          opportunities: Json;
          risks: Json;
          status: string;
          error_message: string | null;
          attempts: number;
          last_attempt_at: string;
          generated_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          story_id: string;
          model?: string;
          prompt_version?: number;
          tier?: "normal" | "important";
          summary: string;
          key_points?: Json;
          why_it_matters?: string;
          opportunities?: Json;
          risks?: Json;
          status?: string;
          error_message?: string | null;
          attempts?: number;
          last_attempt_at?: string;
          generated_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          story_id?: string;
          model?: string;
          prompt_version?: number;
          tier?: "normal" | "important";
          summary?: string;
          key_points?: Json;
          why_it_matters?: string;
          opportunities?: Json;
          risks?: Json;
          status?: string;
          error_message?: string | null;
          attempts?: number;
          last_attempt_at?: string;
          generated_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type SourceRow = Database["public"]["Tables"]["sources"]["Row"];
export type InsertSource = Database["public"]["Tables"]["sources"]["Insert"];
export type UpdateSource = Database["public"]["Tables"]["sources"]["Update"];

export type ArticleRow = Database["public"]["Tables"]["articles"]["Row"];
export type InsertArticle = Database["public"]["Tables"]["articles"]["Insert"];
export type UpdateArticle = Database["public"]["Tables"]["articles"]["Update"];

export type StoryRow = Database["public"]["Tables"]["stories"]["Row"];
export type InsertStory = Database["public"]["Tables"]["stories"]["Insert"];
export type UpdateStory = Database["public"]["Tables"]["stories"]["Update"];

export type StoryArticleRow = Database["public"]["Tables"]["story_articles"]["Row"];
export type InsertStoryArticle = Database["public"]["Tables"]["story_articles"]["Insert"];
export type UpdateStoryArticle = Database["public"]["Tables"]["story_articles"]["Update"];

export type ArticleCategoryRow = Database["public"]["Tables"]["article_categories"]["Row"];
export type InsertArticleCategory = Database["public"]["Tables"]["article_categories"]["Insert"];
export type UpdateArticleCategory = Database["public"]["Tables"]["article_categories"]["Update"];

export type StoryCategoryRow = Database["public"]["Tables"]["story_categories"]["Row"];
export type InsertStoryCategory = Database["public"]["Tables"]["story_categories"]["Insert"];
export type UpdateStoryCategory = Database["public"]["Tables"]["story_categories"]["Update"];

export type StoryIntelligenceRow = Database["public"]["Tables"]["story_intelligence"]["Row"];
export type InsertStoryIntelligence = Database["public"]["Tables"]["story_intelligence"]["Insert"];
export type UpdateStoryIntelligence = Database["public"]["Tables"]["story_intelligence"]["Update"];
