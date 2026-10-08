# The Media Downloader offers video, audio and image formats

The format field began as four video-and-audio options (`audio` plus three video heights). Visitors
now ask for audio as mp3 and for images (png/jpg/webp, and a pass-through of the source file). We
keep the flat enum — one exhaustive list, still `DOWNLOAD_FORMAT` — and extend it by media kind:
`audio` (m4a), `audio-mp3`, `video-{360,720,1080}p` (mp4), and `image-original`, `image-jpg`,
`image-png`, `image-webp`.

## Considered options

- **A structured `{ kind, quality, container }` format.** Rejected: the flat enum's whole point is
  that an invalid audio/quality combination is unrepresentable rather than rejected at runtime.
  The inspect step already narrows the UI to the kinds a link offers, so the enumeration stays
  small and the property survives.
- **Route every format, images included, through yt-dlp.** Rejected for images: yt-dlp only knows
  some image extractors. A direct image URL is fetched and returned as bytes; a supported
  extractor's photo post is extracted by yt-dlp. Optional jpg/png/webp recoding uses the ffmpeg
  already in the host image.
- **Offer svg as a conversion target.** Rejected: svg is a source format, not something ffmpeg can
  produce, so it appears only as a pass-through of the original.

## Consequences

`maxDownloadBytes` gains an image cap; the host's format→args and format→extension maps grow by the
new members; the probe reports image formats with the original's true size and `null` for the
recoded ones (a size we cannot know before converting). A photo link with the original container
`svg` offers the pass-through only.
