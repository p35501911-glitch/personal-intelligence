import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!authError && user) {
      const { error } = await supabase
        .from('user_category_preferences')
        .delete()
        .eq('user_id', user.id)
        .or(`id.eq.${id},category_id.eq.${id}`);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      return NextResponse.json({ success: true, removed_id: id });
    }

    // Unauthenticated preview response
    return NextResponse.json({ success: true, removed_id: id, is_demo: true });
  } catch (error) {
    console.error('Error handling DELETE /api/user/categories/[id]:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
