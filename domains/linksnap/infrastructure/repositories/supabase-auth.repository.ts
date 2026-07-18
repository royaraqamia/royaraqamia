import { AuthRepository } from '@/domains/linksnap/domain/interfaces/auth-repository.interface';
import { getAdminSupabase } from '@/domains/linksnap/infrastructure/supabase/client';

export class SupabaseAuthRepository implements AuthRepository {
  async confirmUserEmail(email: string): Promise<{ userId: string; email: string }> {
    const supabase = getAdminSupabase();

    const { data: userData, error: queryError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .limit(1)
      .maybeSingle();

    if (!queryError && userData) {
      const { error: confirmError } = await supabase.auth.admin.updateUserById(userData.id, {
        email_confirm: true,
      });
      if (confirmError) {
        throw new Error(`Failed to confirm user email: ${confirmError.message}`);
      }
      return { userId: userData.id, email };
    }

    const { data: authUsers, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listError) throw new Error(`Failed to list auth users: ${listError.message}`);

    const matchedUser = authUsers.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!matchedUser) {
      throw new Error('User not found in auth system.');
    }

    const { error: confirmError } = await supabase.auth.admin.updateUserById(matchedUser.id, {
      email_confirm: true,
    });
    if (confirmError) {
      throw new Error(`Failed to confirm user email: ${confirmError.message}`);
    }

    return { userId: matchedUser.id, email };
  }
}
