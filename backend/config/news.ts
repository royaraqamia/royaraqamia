import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createNewsRepository } from '@/backend/repositories/news';
import { createNewsPersonalDigestRepository } from '@/backend/repositories/news/news-personal-digest';
import { createNewsPreferencesRepository } from '@/backend/repositories/news/news-preferences';
import { createNewsSourceRequestsRepository } from '@/backend/repositories/news/news-source-requests';
import { createNewsSourcesRepository } from '@/backend/repositories/news/news-sources';
import { probeFeed } from '@/backend/services/news/feed-probe';
import { createNewsCatalogue, type NewsCatalogue } from '@/backend/services/news/news-catalogue';
import {
  createNewsPersonalDigestService,
  type NewsPersonalDigestService,
} from '@/backend/services/news/news-personal-digest-service';
import {
  createNewsPreferencesService,
  type NewsPreferencesService,
} from '@/backend/services/news/news-preferences-service';
import {
  createNewsAdminService,
  createNewsSourceRequestsService,
  type NewsSourceAdminService,
  type NewsSourceRequestsService,
} from '@/backend/services/news/news-source-requests-service';
import { createNewsService, type NewsService } from '@/backend/services/news/news-service';

/**
 * The digest is read, never written, by the app: publishing needs the service
 * role and happens in the GitHub workflow. A signed-in reader and an anonymous
 * one therefore take the same path, and the public client is the one wired here.
 */
export function createNewsServiceFor(supabase: SupabaseClient<Database>): NewsService {
  return createNewsService(createNewsRepository(supabase));
}

/**
 * The catalogue the picker offers: the repo-versioned list plus the sources an
 * Admin approved, merged on top (ADR-0078). Read through whatever client the
 * caller holds — the additions are publicly readable.
 */
export function createNewsCatalogueFor(supabase: SupabaseClient<Database>): NewsCatalogue {
  return createNewsCatalogue(() => createNewsSourcesRepository(supabase).listEnabled());
}

/**
 * The reader's own selection, wired to the session-scoped client so RLS answers
 * for the row. Separate from `createNewsServiceFor` because the digest reader is
 * public and this one is not.
 */
export function createNewsPreferencesServiceFor(
  supabase: SupabaseClient<Database>
): NewsPreferencesService {
  return createNewsPreferencesService(
    createNewsPreferencesRepository(supabase),
    createNewsCatalogueFor(supabase)
  );
}

/** A reader's own proposal path: submit, and read back what they filed. */
export function createNewsSourceRequestsServiceFor(
  supabase: SupabaseClient<Database>
): NewsSourceRequestsService {
  return createNewsSourceRequestsService({
    requests: createNewsSourceRequestsRepository(supabase),
    sources: createNewsSourcesRepository(supabase),
    probe: (url) => probeFeed(url),
  });
}

/**
 * The Admin queue. Service-role on purpose: the request table has no admin
 * policy, so the decision path is the only thing that can move a row out of
 * `pending`, and it is reachable only behind `withAdminUser`.
 */
export function createDefaultNewsAdminService(): NewsSourceAdminService {
  const supabase = getAdminSupabase();
  return createNewsAdminService({
    requests: createNewsSourceRequestsRepository(supabase),
    catalogue: createNewsCatalogueFor(supabase),
  });
}

/**
 * The reader's own digest (ADR-0079), read through their session so RLS answers
 * for the row. Written only by the workflow, with the service role.
 */
export function createNewsPersonalDigestServiceFor(
  supabase: SupabaseClient<Database>
): NewsPersonalDigestService {
  return createNewsPersonalDigestService(createNewsPersonalDigestRepository(supabase));
}
