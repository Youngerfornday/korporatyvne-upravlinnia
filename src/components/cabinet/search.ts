/** Пошук кабінету: регістр, варіанти апострофа, ґ/г і пробіли не впливають на збіг. */

const APOSTROPHES = /[’'ʼ`‘]/g;

export function normalizeSearch(text: string): string {
  return text
    .normalize('NFC')
    .toLocaleLowerCase('uk-UA')
    .replace(APOSTROPHES, '’')
    .replace(/ґ/g, 'г')
    .replace(/[«»„“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Кожне слово запиту має входити в текст (порядок не важливий): «прн 3 лекція» знаходить «Лекція … ПРН 3». */
export function matchesQuery(searchText: string, query: string): boolean {
  const words = normalizeSearch(query).split(' ').filter(Boolean);
  return words.every((word) => searchText.includes(word));
}
