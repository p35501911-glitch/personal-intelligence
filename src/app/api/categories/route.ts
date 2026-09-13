import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { TAXONOMY_SEED } from '@/lib/data/categories-seed';
import { Category, CategoryNode } from '@/types/category';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const flat = searchParams.get('flat') === 'true';
    const levelParam = searchParams.get('level');

    const supabase = await createClient();
    let query = supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (levelParam) {
      query = query.eq('level', parseInt(levelParam, 10));
    }

    const { data: dbCategories, error } = await query;

    // If Supabase table has data, format and return it
    if (!error && dbCategories && dbCategories.length > 0) {
      if (flat) {
        return NextResponse.json({ categories: dbCategories as Category[] });
      }

      // Build hierarchical tree
      const categoryMap = new Map<string, CategoryNode>();
      const rootCategories: CategoryNode[] = [];

      dbCategories.forEach((cat: Category) => {
        categoryMap.set(cat.id, { ...cat, children: [] });
      });

      dbCategories.forEach((cat: Category) => {
        const node = categoryMap.get(cat.id)!;
        if (cat.parent_id && categoryMap.has(cat.parent_id)) {
          categoryMap.get(cat.parent_id)!.children?.push(node);
        } else if (cat.level === 1) {
          rootCategories.push(node);
        }
      });

      return NextResponse.json({ categories: rootCategories });
    }

    // Fallback to rich taxonomy seed dataset
    if (flat) {
      const flatList: Category[] = [];
      const flatten = (nodes: CategoryNode[]) => {
        for (const node of nodes) {
          const { children, ...rest } = node;
          flatList.push(rest);
          if (children) flatten(children);
        }
      };
      flatten(TAXONOMY_SEED);

      if (levelParam) {
        const levelNum = parseInt(levelParam, 10);
        return NextResponse.json({ categories: flatList.filter((c) => c.level === levelNum) });
      }
      return NextResponse.json({ categories: flatList });
    }

    return NextResponse.json({ categories: TAXONOMY_SEED });
  } catch (error) {
    console.error('Error fetching categories:', error);
    return NextResponse.json({ categories: TAXONOMY_SEED }, { status: 200 });
  }
}
