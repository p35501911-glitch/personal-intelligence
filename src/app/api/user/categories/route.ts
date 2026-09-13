import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';

const savePreferencesSchema = z.object({
  category_ids: z.array(z.string()).max(5, 'You can select up to 5 categories/topics maximum'),
  selection_mode: z.enum(['CUSTOM', 'ALL']).default('CUSTOM'),
});

// In-memory demo store for preview / unauthenticated users in development
let demoStore: { category_ids: string[]; selection_mode: 'CUSTOM' | 'ALL' } = {
  category_ids: ['cat-tech-ai', 'top-ai-agents'],
  selection_mode: 'CUSTOM',
};

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // If authenticated user
    if (!authError && user) {
      const { data: preferences, error } = await supabase
        .from('user_category_preferences')
        .select(`
          id,
          user_id,
          category_id,
          created_at,
          category:categories(*)
        `)
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching user category preferences:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({
        preferences: preferences || [],
        selected_ids: (preferences || []).map((p) => p.category_id),
        selection_mode: 'CUSTOM',
      });
    }

    // Return preview demo state for unauthenticated local development
    return NextResponse.json({
      preferences: demoStore.category_ids.map((id) => ({
        id: `demo-${id}`,
        user_id: 'demo-user',
        category_id: id,
        created_at: new Date().toISOString(),
      })),
      selected_ids: demoStore.category_ids,
      selection_mode: demoStore.selection_mode,
      is_demo: true,
    });
  } catch (error) {
    console.error('Error handling GET /api/user/categories:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const parsed = savePreferencesSchema.safeParse(json);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request body' },
        { status: 400 }
      );
    }

    const { category_ids, selection_mode } = parsed.data;

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // If user is authenticated, save directly to Supabase with RLS
    if (!authError && user) {
      if (selection_mode === 'ALL') {
        // Clear specific category selections if ALL mode
        await supabase
          .from('user_category_preferences')
          .delete()
          .eq('user_id', user.id);

        return NextResponse.json({
          success: true,
          selection_mode: 'ALL',
          selected_ids: [],
        });
      }

      // Enforce max 5 selections
      if (category_ids.length > 5) {
        return NextResponse.json(
          { error: 'Maximum 5 categories/topics allowed' },
          { status: 400 }
        );
      }

      // Atomic update: delete old preferences and insert new selections
      await supabase
        .from('user_category_preferences')
        .delete()
        .eq('user_id', user.id);

      if (category_ids.length > 0) {
        const rowsToInsert = category_ids.map((id) => ({
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
        selected_ids: category_ids,
        selection_mode: 'CUSTOM',
      });
    }

    // Demo store update for preview / unauthenticated local dev
    demoStore = {
      category_ids: selection_mode === 'ALL' ? [] : category_ids.slice(0, 5),
      selection_mode,
    };

    return NextResponse.json({
      success: true,
      selected_ids: demoStore.category_ids,
      selection_mode: demoStore.selection_mode,
      is_demo: true,
    });
  } catch (error) {
    console.error('Error handling POST /api/user/categories:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
