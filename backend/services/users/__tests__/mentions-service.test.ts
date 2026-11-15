import { describe, expect, it } from 'vitest';

import type { PublicUsersRepository } from '@/backend/repositories/users/public-users-repository';
import { MentionsService } from '@/backend/services/users/mentions-service';

/** A stand-in repository, recording the handles the service asked about. */
function fakeUsers(found: string[]) {
  return {
    getManyByUsernames: async (handles: string[]) =>
      handles.filter((handle) => found.includes(handle)),
  } as unknown as PublicUsersRepository;
}

describe('MentionsService', () => {
  it('answers with the handles that exist and nothing else', async () => {
    const service = new MentionsService(fakeUsers(['sara']));

    await expect(service.resolve(['sara', 'nobody'])).resolves.toEqual(['sara']);
  });

  it('lower-cases and de-duplicates before it asks', async () => {
    const asked: string[][] = [];
    const users = {
      getManyByUsernames: async (handles: string[]) => {
        asked.push(handles);
        return handles;
      },
    } as unknown as PublicUsersRepository;

    await new MentionsService(users).resolve(['Sara', 'sara', ' S A R A ']);

    // The last one is not a handle (spaces), so it never reaches the read.
    expect(asked).toEqual([['sara']]);
  });

  it('drops candidates the schema refuses instead of asking about them', async () => {
    const asked: string[][] = [];
    const users = {
      getManyByUsernames: async (handles: string[]) => {
        asked.push(handles);
        return [];
      },
    } as unknown as PublicUsersRepository;

    await new MentionsService(users).resolve(['ab', '-sara', 'sara-', 'ok-handle', 'سارة']);

    expect(asked[0]).toEqual(['ok-handle', 'سارة']);
  });

  it('asks about nothing when the text mentions nobody', async () => {
    const users = { getManyByUsernames: async () => [] } as unknown as PublicUsersRepository;

    await expect(new MentionsService(users).resolve([])).resolves.toEqual([]);
  });
});
