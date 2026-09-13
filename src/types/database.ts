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
          description: string | null;
          content: string | null;
          url: string;
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
          description?: string | null;
          content?: string | null;
          url: string;
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
          description?: string | null;
          content?: string | null;
          url?: string;
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
