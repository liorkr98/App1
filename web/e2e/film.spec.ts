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

/**
 * The feed shapes and the music (18 Oct 2026). A square film with the calm
 * mood: the frame is 1080 × 1080, and the file carries sound you can hear —
 * decoded and measured, not just a track that might be silence.
 */
test('a square film with music is 1080×1080 and has sound in it', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/lab/film/?format=square&music=calm');
  await page.locator('[data-film-make]').click();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-film', /done|failed/, { timeout: 100_000 });
  await expect(html).toHaveAttribute('data-film', 'done');

  const data = await html.evaluate((element) => ({ ...(element as HTMLElement).dataset }));
  expect(data.filmWidth).toBe('1080');
  expect(data.filmHeight).toBe('1080');
  expect(data.filmMusic).toBe('true');

  const heard = await page.locator('[data-film-video]').evaluate(async (node) => {
    const video = node as HTMLVideoElement;
    if (video.readyState < 1) await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
    const bytes = await (await fetch(video.src)).arrayBuffer();
    const context = new OfflineAudioContext(1, 44_100, 44_100);
    const audio = await context.decodeAudioData(bytes);
    const samples = audio.getChannelData(0);
    // The middle of the film: past the fade-in, before the fade-out.
    const from = Math.floor(samples.length * 0.4);
    const to = Math.floor(samples.length * 0.6);
    let sum = 0;
    for (let index = from; index < to; index++) sum += samples[index]! * samples[index]!;
    return { width: video.videoWidth, height: video.videoHeight, rms: Math.sqrt(sum / (to - from)), seconds: audio.duration };
  });
  expect(heard.width).toBe(1080);
  expect(heard.height).toBe(1080);
  expect(heard.seconds).toBeGreaterThan(5);
  expect(heard.rms, 'the music is audible in the middle of the film').toBeGreaterThan(0.005);
});
