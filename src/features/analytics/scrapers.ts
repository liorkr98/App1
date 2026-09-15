/**
 * User-Agent strings that fetch a listing without a person behind them.
 *
 * The OG card is the product's distribution surface. WhatsApp, Slack and the
 * rest retrieve the page to build a preview, and counting those as views
 * would make every forwarded link look like a hit. Filter them before
 * record_listing_event so the dashboard is a person-count, not a scraper-count.
 *
 * Absence of a UA is not treated as a scraper: some in-app browsers send
 * nothing useful, and a missing header must not drop a real open.
 */
const PREVIEW_SCRAPER =
  /whatsapp|facebookexternalhit|facebot|twitterbot|slackbot|telegrambot|linkedinbot|discordbot|pinterest|googlebot|bingbot|yandex|baiduspider|duckduckbot|applebot|ia_archiver|semrush|ahrefs|mj12bot|preview|embedly|bitlybot|skypeuripreview|vkshare|whatsapp/i;

export function isPreviewScraper(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return PREVIEW_SCRAPER.test(userAgent);
}
