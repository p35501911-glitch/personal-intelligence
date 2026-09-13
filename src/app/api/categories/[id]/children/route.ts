import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { TAXONOMY_SEED } from '@/lib/data/categories-seed';
import { CategoryNode } from '@/types/category';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Query Supabase for children
    const { data: dbChildren, error } = await supabase
      .from('categories')
      .select('*')
      .eq('parent_id', id)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (!error && dbChildren && dbChildren.length > 0) {
      return NextResponse.json({ children: dbChildren });
    }

    // Fallback lookup in seed data
    let foundChildren: CategoryNode[] = [];
    const searchNode = (nodes: CategoryNode[]) => {
      for (const node of nodes) {
        if (node.id === id || node.slug === id) {
          foundChildren = node.children || [];
          return;
        }
        if (node.children) searchNode(node.children);
      }
    };
    searchNode(TAXONOMY_SEED);

    return NextResponse.json({ children: foundChildren });
  } catch (error) {
    console.error('Error fetching category children:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
