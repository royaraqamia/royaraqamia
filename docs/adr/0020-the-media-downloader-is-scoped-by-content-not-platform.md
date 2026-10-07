# The Media Downloader is scoped by content, not by Platform

"Download from any social media platform" invites copyright and terms-of-service exposure, so
the obvious safe move is to curate a short list of platforms and exclude the risky ones such as
YouTube. We split the two axes instead. Platform breadth is maximal: a config-driven allowlist
with every Platform we can extract, YouTube included, enabled or disabled by an Admin, and
served best-effort behind per-Platform circuit breakers. Content is what we restrict: public
links only, never DRM-protected, paywalled, private or login-gated media, stated in the
Acceptable-Use notice and the `/terms` clause.

## Considered options

- **Curate a safe sublist of Platforms.** Rejected: it conflates the tool's coverage with a
  content policy, and freezes coverage at whatever we vetted on day one.
- **Exclude YouTube outright.** Rejected for the same reason: ToS risk lives in the content a
  visitor chooses, not in the existence of a YouTube toggle, and the toggle lets an operator
  pull a Platform without a deploy.

## Consequences

Platforms will break often and unpredictably, so the allowlist and circuit breakers are
operational knobs, and the page carries a standing Acceptable-Use notice plus
`contact@royaraqamia.com` as the takedown address. Enforcement is by content policy, not by
Platform list.
