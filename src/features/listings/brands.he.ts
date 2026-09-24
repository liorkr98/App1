/**
 * Israeli chains a buyer recognises on sight.
 *
 * The same list lives in ingest/data/brands.he.json. Matching is against
 * OSM brand, brand:he, operator and name:he — a corner shop called מרים
 * does not appear here, and that is the point.
 */
export const BRANDS = {
  grocery: [
    'AM:PM',
    'שופרסל',
    'רמי לוי',
    'טיב טעם',
    'יינות ביתן',
    'ויקטורי',
    'מגה בעיר',
    'סופר יודה',
    'סטופ מרקט',
    'יוחננוף',
    'אושר עד',
    'סופר פארם',
  ],
  pharmacy: ['סופר פארם', 'Be', 'ניו פארם'],
  cafe: ['ארומה', 'קפה קפה', 'לנדוור', 'קופיקס', 'רולדין', 'אנגלו סכסון בייקרי'],
  fastFood: ["מקדונלד'ס", 'BBB', "ג'פניקה", 'בורגר ראנץ\''],
  fitness: ['הולמס פלייס', 'גו אקטיב', 'ICON', 'פיט ולנס'],
} as const;

export type BrandCategory = keyof typeof BRANDS;

export const BRAND_LIST: { brand: string; category: BrandCategory }[] = (
  Object.entries(BRANDS) as [BrandCategory, readonly string[]][]
).flatMap(([category, names]) => names.map((brand) => ({ brand, category })));
