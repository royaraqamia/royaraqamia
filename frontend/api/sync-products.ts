import { BlogpressLocalStore } from '@/frontend/api/blogpress/local-store';
import { BlogpressSyncEngine } from '@/frontend/api/blogpress/sync-engine';
import { createBlogpressHttpSyncTransport } from '@/frontend/api/blogpress/sync-transport';
import { pullBlogpressData } from '@/frontend/api/blogpress/pull';
import { HabitLocalStore } from '@/frontend/api/habitflow/local-store';
import { pullHabitData } from '@/frontend/api/habitflow/pull';
import { HabitSyncEngine } from '@/frontend/api/habitflow/sync-engine';
import { createHttpSyncTransport } from '@/frontend/api/habitflow/sync-transport';
import { LeadsSyncEngine } from '@/frontend/api/leads/sync-engine';
import { createLeadHttpSyncTransport } from '@/frontend/api/leads/sync-transport';
import { LinksnapLocalStore } from '@/frontend/api/linksnap/local-store';
import { pullLinksnapData } from '@/frontend/api/linksnap/pull';
import { LinksnapSyncEngine } from '@/frontend/api/linksnap/sync-engine';
import { createLinksnapHttpSyncTransport } from '@/frontend/api/linksnap/sync-transport';
import { NotesLocalStore } from '@/frontend/api/notes/local-store';
import { pullNotesData } from '@/frontend/api/notes/pull';
import { NotesSyncEngine } from '@/frontend/api/notes/sync-engine';
import { createNotesHttpSyncTransport } from '@/frontend/api/notes/sync-transport';
import { QuranLocalStore } from '@/frontend/api/quran/local-store';
import { pullQuranData } from '@/frontend/api/quran/pull';
import { QuranSyncEngine } from '@/frontend/api/quran/sync-engine';
import { createQuranHttpSyncTransport } from '@/frontend/api/quran/sync-transport';
import { pullSpendtrackData } from '@/frontend/api/spendtrack/pull';
import { SpendtrackLocalStore } from '@/frontend/api/spendtrack/local-store';
import { SpendtrackSyncEngine } from '@/frontend/api/spendtrack/sync-engine';
import { createSpendtrackHttpSyncTransport } from '@/frontend/api/spendtrack/sync-transport';
import type {
  DrainableProduct,
  DrainSession,
  OpenedProduct,
  OpenProductDeps,
} from '@/frontend/shared/local-store/drain-outbox';
import type { PullableProduct } from '@/frontend/shared/local-store/refresh-products';
import {
  GUEST_IDENTITY,
  localStoreName,
  userIdentity,
} from '@/frontend/shared/local-store/identity';
import { openOutboxAccess } from '@/frontend/shared/local-store/outbox-access';
import type { SyncTransport } from '@/frontend/shared/local-store/sync-transport';

/**
 * The products a background flush can drain (ADR-0058).
 *
 * This is the composition root for the service worker's Outbox drain: the only
 * module that knows all the products at once, imported by the worker bundle and
 * nothing else. The page never loads it — a product's own hook imports its own
 * engine binding — so adding a row here costs the app bundle nothing.
 *
 * The product name is the Local Store's database prefix, and it has to match the
 * `PRODUCT` constant in that product's store: `scripts/…` cannot check it, so
 * `frontend/shared/local-store/__tests__/drain-products.test.ts` opens every real
 * store and asserts this list finds it.
 *
 * Every product here replays through the session cookie, which the browser
 * attaches to a same-origin fetch from any realm. LinkSnap's routes used to
 * accept only a bearer token — a credential no worker can read — and its
 * transport now carries none at all: the routes resolve the cookie when the
 * header is absent (`backend/transport/session-or-bearer-handler.ts`). A new
 * product joins by making its writes cookie-authenticated, not by teaching the
 * worker a second credential.
 */

/** The account's own stores, and no other: a guest namespace claims on sign-in. */
function signedInIdentity(session: DrainSession | null) {
  return session ? userIdentity(session.userId) : null;
}

/**
 * Opens just the Outbox of a product whose transport needs nothing more. The
 * store is opened only if it already exists, and at its current version: a
 * worker wake must never create or migrate a database it does not own.
 */
function openOutboxOnly(
  product: string,
  createTransport: () => SyncTransport
): (deps: OpenProductDeps) => Promise<OpenedProduct | null> {
  return async ({ identity, existingDatabases, factory }) => {
    const opened = await openOutboxAccess(localStoreName(product, identity), {
      existingDatabases,
      factory,
    });
    if (!opened) return null;

    return { store: opened.store, transport: createTransport(), close: opened.close };
  };
}

export const DRAINABLE_PRODUCTS: readonly DrainableProduct[] = [
  {
    product: 'habitflow',
    identity: signedInIdentity,
    open: openOutboxOnly('habitflow', createHttpSyncTransport),
    createEngine: (deps) => new HabitSyncEngine(deps),
  },
  {
    product: 'spendtrack',
    identity: signedInIdentity,
    open: openOutboxOnly('spendtrack', createSpendtrackHttpSyncTransport),
    createEngine: (deps) => new SpendtrackSyncEngine(deps),
  },
  {
    product: 'blogpress',
    identity: signedInIdentity,
    /**
     * The one product whose transport needs more than the Outbox: a queued edit
     * carries media placeholders, and resolving them uploads through the store.
     * So this opens the product store — still only once the database exists, so
     * a worker wake cannot create one.
     */
    async open({ identity, existingDatabases, factory }) {
      if (!existingDatabases?.includes(localStoreName('blogpress', identity))) return null;

      // A store whose schema is newer than this worker's chain throws here, and
      // the drain records it per product: the page flushes that one instead, so
      // nothing is lost by the worker declining to open it.
      const store = await BlogpressLocalStore.open(identity, factory);
      return {
        store,
        transport: createBlogpressHttpSyncTransport(store),
        close: () => store.close(),
      };
    },
    createEngine: (deps) => new BlogpressSyncEngine(deps),
  },
  {
    product: 'quran',
    identity: signedInIdentity,
    open: openOutboxOnly('quran', createQuranHttpSyncTransport),
    createEngine: (deps) => new QuranSyncEngine(deps),
  },
  {
    product: 'linksnap',
    identity: signedInIdentity,
    open: openOutboxOnly('linksnap', createLinksnapHttpSyncTransport),
    createEngine: (deps) => new LinksnapSyncEngine(deps),
  },
  {
    product: 'notes',
    identity: signedInIdentity,
    open: openOutboxOnly('notes', createNotesHttpSyncTransport),
    createEngine: (deps) => new NotesSyncEngine(deps),
  },
  {
    product: 'leads',
    /**
     * Lead submissions are the exception to the identity rule: the store *is*
     * the guest namespace, and a guest's project request is meaningful on its
     * own, so it drains with or without a session.
     */
    identity: () => GUEST_IDENTITY,
    open: openOutboxOnly('leads', createLeadHttpSyncTransport),
    createEngine: (deps) => new LeadsSyncEngine(deps),
  },
];

/**
 * The products a background refresh can pull (ADR-0060).
 *
 * Same composition root as the drain, for the same reason: this is the only
 * module that knows every product at once, and only the background tiers import
 * it — the app bundle never does.
 *
 * LinkSnap's read takes the session cookie for the same reason its writes do:
 * the page's token lives in React state, which a worker cannot read, while the
 * browser sends the cookie on its behalf. BlogPress joined the same way (#384):
 * its editor-surface pull (`pullBlogpressData`) is the transport a background
 * realm runs, authenticating with the session cookie.
 *
 * **Not here, on purpose:**
 *
 * - **Leads.** Delivered, not owned: submissions have no server rows to merge.
 */
export const PULLABLE_PRODUCTS: readonly PullableProduct[] = [
  {
    product: 'habitflow',
    identity: signedInIdentity,
    async refresh({ identity, existingDatabases, factory }) {
      if (!existingDatabases?.includes(localStoreName('habitflow', identity))) return 0;
      const store = await HabitLocalStore.open(identity, factory);
      try {
        return await pullHabitData(store);
      } finally {
        store.close();
      }
    },
  },
  {
    product: 'spendtrack',
    identity: signedInIdentity,
    async refresh({ identity, existingDatabases, factory }) {
      if (!existingDatabases?.includes(localStoreName('spendtrack', identity))) return 0;
      const store = await SpendtrackLocalStore.open(identity, factory);
      try {
        return await pullSpendtrackData(store);
      } finally {
        store.close();
      }
    },
  },
  {
    product: 'blogpress',
    identity: signedInIdentity,
    // The full store open rather than outbox-only: the merge reads the drafts
    // alongside the queued intents it must not clobber.
    async refresh({ identity, existingDatabases, factory }) {
      if (!existingDatabases?.includes(localStoreName('blogpress', identity))) return 0;
      const store = await BlogpressLocalStore.open(identity, factory);
      try {
        return await pullBlogpressData(store);
      } finally {
        store.close();
      }
    },
  },
  {
    product: 'quran',
    identity: signedInIdentity,
    async refresh({ identity, existingDatabases, factory }) {
      if (!existingDatabases?.includes(localStoreName('quran', identity))) return 0;
      const store = await QuranLocalStore.open(identity, factory);
      try {
        return await pullQuranData(store);
      } finally {
        store.close();
      }
    },
  },
  {
    product: 'linksnap',
    identity: signedInIdentity,
    async refresh({ identity, existingDatabases, factory }) {
      if (!existingDatabases?.includes(localStoreName('linksnap', identity))) return 0;
      const store = await LinksnapLocalStore.open(identity, factory);
      try {
        return await pullLinksnapData(store);
      } finally {
        store.close();
      }
    },
  },
  {
    product: 'notes',
    identity: signedInIdentity,
    async refresh({ identity, existingDatabases, factory }) {
      if (!existingDatabases?.includes(localStoreName('notes', identity))) return 0;
      const store = await NotesLocalStore.open(identity, factory);
      try {
        return await pullNotesData(store);
      } finally {
        store.close();
      }
    },
  },
];
