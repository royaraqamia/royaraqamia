import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import {
  AVATARS_BUCKET,
  createAvatarStorageRepository,
} from '@/backend/repositories/users/avatar-storage-repository';

function makeClient() {
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const getPublicUrl = vi.fn((name: string) => ({
    data: {
      publicUrl: `https://proj.supabase.co/storage/v1/object/public/${AVATARS_BUCKET}/${name}`,
    },
  }));
  const from = vi.fn().mockReturnValue({ upload, remove, getPublicUrl });
  const client = { storage: { from } } as unknown as SupabaseClient<Database>;
  return { client, from, upload, remove, getPublicUrl };
}

describe('createAvatarStorageRepository', () => {
  it('uploads under the caller folder and returns the public URL', async () => {
    const { client, from, upload } = makeClient();
    const repository = createAvatarStorageRepository(client);

    const url = await repository.upload('user-1', new File(['x'], 'me.PNG', { type: 'image/png' }));

    expect(from).toHaveBeenCalledWith(AVATARS_BUCKET);
    const [path, , options] = upload.mock.calls[0] as [string, unknown, { contentType: string }];
    expect(path).toMatch(/^user-1\/[0-9a-f-]+\.png$/);
    expect(options.contentType).toBe('image/png');
    expect(url).toBe(`https://proj.supabase.co/storage/v1/object/public/${AVATARS_BUCKET}/${path}`);
  });

  it('deletes the object named by a public avatar URL', async () => {
    const { client, remove } = makeClient();
    const repository = createAvatarStorageRepository(client);

    await repository.remove(
      `https://proj.supabase.co/storage/v1/object/public/${AVATARS_BUCKET}/user-1/old.png`
    );

    expect(remove).toHaveBeenCalledWith(['user-1/old.png']);
  });

  it('ignores a URL that does not point at the avatars bucket', async () => {
    const { client, remove } = makeClient();
    const repository = createAvatarStorageRepository(client);

    await repository.remove('https://example.com/some/other/image.png');

    expect(remove).not.toHaveBeenCalled();
  });
});
