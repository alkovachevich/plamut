import { safeArray } from "../../utils.js";

// Emergency safety layer.
//
// Book enrichment previously performed broad Wikidata/Wikipedia lookups by title.
// That is unsafe for books because titles often collide with adaptations, games,
// films, series, guides, and other derivative works. Example: a book result for
// Harry Potter could receive a Wikipedia description from the video game page.
//
// The main books-search.js already performs stricter book search and enrichment.
// Until the book identity resolver is stricter, this helper must be additive-safe
// and must not alter book metadata by loose title lookup.
export async function enrichBookSearchResults(items = []) {
  return safeArray(items);
}
