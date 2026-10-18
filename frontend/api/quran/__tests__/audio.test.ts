import { describe, expect, it } from 'vitest';
import { audioFileUrl, audioManifestUrl } from '../audio';
import type { QuranAudioFile } from '@/shared/contracts/quran-audio';

const FILE: QuranAudioFile = {
  ayah: 5,
  key: 'ar.alafasy/002/005.mp3',
  bytes: 1024,
  sha256: 'abcdef12' + '0'.repeat(56),
};

describe('audioFileUrl', () => {
  it('serves an Ayah from the edition host, versioned by its own hash', () => {
    // The hash is what makes an immutable URL honest: a replacement is a new
    // hash, and therefore a key no cache has ever seen (ADR-0062).
    expect(audioFileUrl('https://audio.example.com', FILE)).toBe(
      'https://audio.example.com/ar.alafasy/002/005.mp3?v=abcdef12'
    );
  });
});

describe('audioManifestUrl', () => {
  it('pads the sura like the text manifests, so the files sort together', () => {
    expect(audioManifestUrl(1)).toBe('/quran/audio/ar.alafasy/001.json');
    expect(audioManifestUrl(114)).toBe('/quran/audio/ar.alafasy/114.json');
  });
});
