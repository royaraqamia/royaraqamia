'use client';

/**
 * `next/dynamic` for the bundled surface: a `React.lazy` behind the same
 * signature, so a component that code-splits keeps working outside Next.
 *
 * There is no server render here, so `ssr` has nothing to switch off; `loading`
 * is used as the Suspense fallback, which is what Next does on the client.
 */

import { Suspense, lazy, type ComponentType, type ReactElement, type ReactNode } from 'react';

type Loader<P> = () => Promise<ComponentType<P> | { default: ComponentType<P> }>;

interface DynamicOptions {
  ssr?: boolean;
  loading?: ComponentType<Record<string, unknown>>;
}

export default function dynamic<P extends Record<string, unknown> = Record<string, unknown>>(
  loader: Loader<P>,
  options: DynamicOptions = {}
): ComponentType<P> {
  const Lazy = lazy(async () => {
    const loaded = await loader();
    return 'default' in loaded ? loaded : { default: loaded };
  });

  const Fallback = options.loading;

  function DynamicComponent(props: P): ReactElement {
    const fallback: ReactNode = Fallback ? <Fallback /> : null;
    return (
      <Suspense fallback={fallback}>
        <Lazy {...props} />
      </Suspense>
    );
  }

  DynamicComponent.displayName = 'DynamicSpike';

  return DynamicComponent;
}
