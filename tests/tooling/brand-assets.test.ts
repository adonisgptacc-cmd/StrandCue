import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function pngSize(path: string): readonly [number, number] {
  const data = readFileSync(path);
  expect(data.subarray(1, 4).toString('ascii')).toBe('PNG');
  return [data.readUInt32BE(16), data.readUInt32BE(20)] as const;
}

describe('StrandCue brand assets', () => {
  it('configures the approved mobile icon, adaptive mark and splash', () => {
    const config = JSON.parse(readFileSync('apps/mobile/app.json', 'utf8')).expo;
    expect(config.icon).toBe('./assets/brand/icon.png');
    expect(config.splash).toEqual({
      image: './assets/brand/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#FDF2E6',
    });
    expect(config.android.adaptiveIcon).toEqual({
      foregroundImage: './assets/brand/adaptive-foreground.png',
      monochromeImage: './assets/brand/adaptive-monochrome.png',
      backgroundColor: '#63295E',
    });
    expect(config.web.favicon).toBe('./assets/brand/icon.png');
  });

  it('keeps required production exports at their declared sizes', () => {
    const assets = new Map<string, readonly [number, number]>([
      ['docs/brand/strandcue-logo-master.png', [1254, 1254]],
      ['apps/mobile/assets/brand/icon.png', [1024, 1024]],
      ['apps/mobile/assets/brand/adaptive-foreground.png', [1024, 1024]],
      ['apps/mobile/assets/brand/adaptive-monochrome.png', [1024, 1024]],
      ['apps/mobile/assets/brand/splash-icon.png', [1024, 1024]],
      ['apps/mobile/assets/brand/play-store-icon.png', [512, 512]],
      ['website/public/brand/favicon.png', [64, 64]],
      ['website/public/brand/apple-touch-icon.png', [180, 180]],
      ['website/public/brand/strandcue-mark.png', [256, 256]],
      ['website/public/brand/strandcue-social.png', [1200, 630]],
    ]);
    for (const [path, expected] of assets) {
      expect(existsSync(path), path).toBe(true);
      expect(pngSize(path), path).toEqual(expected);
    }
  });
});
