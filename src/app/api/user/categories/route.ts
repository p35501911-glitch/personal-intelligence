import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const putUserCategoriesSchema = z.object({
  mode: z.enum(['CATEGORY', 'ALL']),
  categoryIds: z.array(z.string()).max(5, 'You can select up to 5 categories.'),
}).refine(
  (data) => {
    if (data.mode === 'ALL' && data.categoryIds.length > 0) {
      return false;
    }
    return true;
  },
  {
    message: 'categoryIds must be empty when mode is ALL.',
    path: ['categoryIds'],
  }
);

// In-memory store for local testing & unauthenticated preview sessions
let demoPreferencesStore: {
  mode: 'CATEGORY' | 'ALL';
  categoryIds: string[];
} = {
  mode: 'CATEGORY',
  categoryIds: ['cat-tech-ai', 'top-ai-agents'],
};

export function getDemoPreferences() {
  return demoPreferencesStore;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // If authenticated user
    if (!authError && user) {
      // 1. Fetch user selection mode from user_preferences
      const { data: prefData } = await supabase
        .from('user_preferences')
        .select('category_selection_mode')
        .eq('user_id', user.id)
        .maybeSingle();

      const mode = (prefData?.category_selection_mode as 'CATEGORY' | 'ALL') || 'CATEGORY';

      if (mode === 'ALL') {
        return NextResponse.json({
          mode: 'ALL',
          categoryIds: [],
        });
      }

      // 2. Fetch selected category IDs
      const { data: catRows, error: catError } = await supabase
        .from('user_category_preferences')
        .select('category_id')
        .eq('user_id', user.id);

      if (catError) {
        console.error('Error fetching user_category_preferences:', catError);
        return NextResponse.json({ error: catError.message }, { status: 400 });
      }

      return NextResponse.json({
        mode: 'CATEGORY',
        categoryIds: (catRows || []).map((row) => row.category_id),
      });
    }

    // Dev preview fallback
    return NextResponse.json({
      mode: demoPreferencesStore.mode,
      categoryIds: demoPreferencesStore.categoryIds,
      is_demo: true,
    });
  } catch (error) {
    console.error('Error handling GET /api/user/categories:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const json = await request.json();
    const parsed = putUserCategoriesSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 }
      );
    }

    const { mode, categoryIds } = parsed.data;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // If authenticated user
    if (!authError && user) {
      // 1. Upsert user_preferences (category_selection_mode)
      const { error: prefError } = await supabase
        .from('user_preferences')
        .upsert({
          user_id: user.id,
          category_selection_mode: mode,
          updated_at: new Date().toISOString(),
        });

      if (prefError) {
        console.error('Error updating user_preferences:', prefError);
      }

      // 2. Clear old individual category selections
      await supabase
        .from('user_category_preferences')
        .delete()
        .eq('user_id', user.id);

      // 3. If mode is CATEGORY and there are category IDs, insert new selections
      if (mode === 'CATEGORY' && categoryIds.length > 0) {
        const rowsToInsert = categoryIds.map((id) => ({
          user_id: user.id,
          category_id: id,
        }));

        const { error: insertError } = await supabase
          .from('user_category_preferences')
          .insert(rowsToInsert);

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 400 });
        }
      }

      return NextResponse.json({
        success: true,
        mode,
        categoryIds: mode === 'ALL' ? [] : categoryIds,
      });
    }

    // Dev preview update
    demoPreferencesStore = {
      mode,
      categoryIds: mode === 'ALL' ? [] : categoryIds.slice(0, 5),
    };

    return NextResponse.json({
      success: true,
      mode: demoPreferencesStore.mode,
      categoryIds: demoPreferencesStore.categoryIds,
      is_demo: true,
    });
  } catch (error) {
    console.error('Error handling PUT /api/user/categories:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Keep POST for backwards compatibility, delegating to PUT logic
export async function POST(request: Request) {
  const json = await request.json();
  const normalized = {
    mode: json.mode || json.selection_mode || (json.category_ids?.length === 0 ? 'ALL' : 'CATEGORY'),
    categoryIds: json.categoryIds || json.category_ids || [],
  };

  const syntheticReq = new Request(request.url, {
    method: 'PUT',
    headers: request.headers,
    body: JSON.stringify(normalized),
  });

  return PUT(syntheticReq);
}
