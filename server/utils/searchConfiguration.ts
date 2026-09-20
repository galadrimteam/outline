/**
 * galadrim: the Postgres text search configuration that documents are indexed
 * with, in place of upstream's hardcoded 'english'. It is created by the
 * migration 20260919120000-galadrim-search-unaccent-language.js as a copy of
 * the team's language (French for us) with `unaccent` in front of the stemmer,
 * so that "securite" finds "Sécurité".
 *
 * Every `to_tsquery` run against `documents."searchVector"` must use it: a
 * vector and a query built with different configurations silently miss.
 */
export const SEARCH_CONFIGURATION = "outline_search";
