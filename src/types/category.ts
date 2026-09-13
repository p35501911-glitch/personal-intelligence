export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parent_id: string | null;
  level: 1 | 2 | 3;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CategoryNode extends Category {
  children?: CategoryNode[];
}

export interface UserCategoryPreference {
  id: string;
  user_id: string;
  category_id: string;
  created_at: string;
  category?: Category;
}

export type CategorySelectionMode = 'CUSTOM' | 'ALL';

export interface CategorySelectionState {
  selectedIds: string[];
  selectionMode: CategorySelectionMode;
}
