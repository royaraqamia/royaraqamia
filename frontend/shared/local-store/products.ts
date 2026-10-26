/**
 * The registry of products that keep a Local Store on this device (#493, #495).
 *
 * A product is named here once, and the guard test
 * (`__tests__/local-store-roots.test.ts`) reads the table to make sure it also
 * resolves its partition through `useLocalIdentity` and paints its last screen
 * in the first frame. A product added to the registry without both entries fails
 * that test rather than shipping a store with no paint path.
 */
export interface LocalStoreProduct {
  /** The Local Store's database prefix — `PRODUCT` in the product's store. */
  readonly product: string;
  readonly label: string;
}

/** Every product that keeps a Local Store on this device. */
export const LOCAL_STORE_PRODUCTS: readonly LocalStoreProduct[] = [
  { product: 'habitflow', label: 'تتبُّع العادات' },
  { product: 'spendtrack', label: 'تتبُّع المصاريف' },
  { product: 'linksnap', label: 'اختصار الرَّوابط' },
  { product: 'blogpress', label: 'إدارة المنشورات' },
  { product: 'quran', label: 'القرآن الكريم' },
  { product: 'leads', label: 'طَلبات التَّواصل' },
];

/** The surface a product resolves its boot identity in (#493), and its snapshot (#495). */
export interface LocalStoreRoot {
  /** One of {@link LOCAL_STORE_PRODUCTS}'s products. */
  readonly product: string;
  /**
   * The file whose identity resolution the guard test reads — the component
   * that calls `useLocalIdentity` and hands the partition to the store. `null`
   * is a deliberate exemption, and it requires {@link exemption}.
   */
  readonly root: string | null;
  /**
   * The file that reads and records this product's first-frame snapshot
   * (#495). A product with a store but no snapshot paints an empty first frame
   * after a cold navigation, which is the regression the guard test fails on.
   */
  readonly snapshot: string | null;
  /** Why this product has no root or snapshot to check. Only for `null` entries. */
  readonly exemption?: string;
}

/**
 * The checklist behind `LOCAL_STORE_PRODUCTS` (#493, #495): where each product's
 * partition is resolved and where its first frame is recorded, so a product
 * cannot ship a Local Store without inheriting the paint path.
 *
 * The list is data rather than a test-local map on purpose — adding a seventh
 * product to `LOCAL_STORE_PRODUCTS` without naming its root here fails
 * `local-store-roots.test.ts`, and that failure is the guard, not a lint.
 */
export const LOCAL_STORE_ROOTS: readonly LocalStoreRoot[] = [
  {
    product: 'habitflow',
    root: 'frontend/ui/habitflow/components/habitflow-page-client.tsx',
    snapshot: 'frontend/state/habitflow/use-dashboard-data.ts',
  },
  {
    product: 'spendtrack',
    root: 'frontend/ui/spendtrack/spendtrack-page-client.tsx',
    snapshot: 'frontend/state/spendtrack/use-spendtrack.ts',
  },
  {
    product: 'linksnap',
    root: 'frontend/ui/linksnap/link-snap-app-view.tsx',
    snapshot: 'frontend/state/linksnap/use-linksnap.ts',
  },
  {
    product: 'blogpress',
    root: 'frontend/ui/blogpress/blogpress-dashboard.tsx',
    snapshot: 'frontend/state/blogpress/use-blogpress-dashboard.ts',
  },
  {
    product: 'quran',
    root: 'frontend/state/quran/use-quran-reader.ts',
    snapshot: 'frontend/state/quran/use-quran-reader.ts',
  },
  {
    product: 'leads',
    root: null,
    snapshot: null,
    exemption:
      'guest-pinned: frontend/api/leads/local-store.ts opens GUEST_IDENTITY only, so there is no user partition to reconcile and no per-identity first frame to carry',
  },
];
