import { expect, test } from '@playwright/test';

import { storyDuration } from '@/features/listings/film-overlay';

/**
 * The story file is what it says it is (13 Oct 2026).
 *
 * Measured before: the .mp4 was VP9 labelled h264, and a 16 s film ran
 * 17.7 s at 20 fps because the loop counted frames instead of reading the
 * clock. /lab/film/ runs the editor's own recordFilm on the demo flat.
 *
 * CI's Chromium has no H.264 encoder, so there the honest answer is WebM;
 * what must hold everywhere is that the label matches the container and the
 * file lasts as long as the film.
 */
test('the story file is 1080×1920, honestly labelled, and as long as the film', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/lab/film/');
  await page.locator('[data-film-make]').click();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-film', /done|failed/, { timeout: 100_000 });
  await expect(html).toHaveAttribute('data-film', 'done');

  const data = await html.evaluate((element) => ({ ...(element as HTMLElement).dataset }));
  expect(data.filmWidth).toBe('1080');
  expect(data.filmHeight).toBe('1920');
  expect(data.filmCodec === 'h264' ? 'mp4' : 'webm').toBe(data.filmExtension);
  expect(Number(data.filmBytes)).toBeGreaterThan(100_000);

  // The demo flat: four photographs and a closing card.
  const expected = storyDuration(4, true);
  const actual = await page.locator('[data-film-video]').evaluate(async (node) => {
    const video = node as HTMLVideoElement;
    if (Number.isNaN(video.duration) || video.readyState < 1) {
      await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
    }
    // A recorder's WebM has no duration in its header until it is sought.
    if (!Number.isFinite(video.duration)) {
      await new Promise((resolve) => {
        video.addEventListener('durationchange', resolve, { once: true });
        video.currentTime = 1e9;
      });
    }
    return video.duration;
  });
  expect(Math.abs(actual - expected), `${actual}s for a ${expected}s film`).toBeLessThan(0.8);
});
