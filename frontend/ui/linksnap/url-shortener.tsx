'use client';

import { SingleUrlShortener } from './single-url-shortener';

interface UrlShortenerProps {
  token: string | null;
  onLinkCreated: () => void;
}

export function UrlShortener({ token, onLinkCreated }: UrlShortenerProps) {
  return (
    <div className="w-full bg-card p-5 sm:p-8 rounded-3xl border border-border shadow-elevated card-lift">
      <SingleUrlShortener token={token} onLinkCreated={onLinkCreated} />
    </div>
  );
}
