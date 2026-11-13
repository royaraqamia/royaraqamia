'use client';

import * as React from 'react';

/**
 * The country the platform resolved for this request, handed from a server
 * component to the client tree that wants a location-based default.
 *
 * This replaced the `rr-country` cookie (ADR-0176). The cookie was stamped on
 * every navigation so a form could read it after hydration, and a response that
 * carries `Set-Cookie` is never stored by a shared cache — which is why the site
 * could cache no HTML at all. A value passed down costs nothing and changes no
 * response header.
 */
const GeoCountryContext = React.createContext<string | null>(null);

export function GeoCountryProvider({
  value,
  children,
}: {
  value: string | null;
  children: React.ReactNode;
}) {
  return <GeoCountryContext.Provider value={value}>{children}</GeoCountryContext.Provider>;
}

/** The platform's country for this request, or null when there is no geo data. */
export function useGeoCountry(): string | null {
  return React.useContext(GeoCountryContext);
}
