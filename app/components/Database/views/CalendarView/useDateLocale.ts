import type { Locale } from "date-fns";
import { fr } from "date-fns/locale/fr";
import { dateLocale } from "@shared/utils/date";
import useUserLocale from "~/hooks/useUserLocale";

/**
 * Returns the date-fns locale of the reader, French when unknown: month and
 * day names of calendars and timelines follow it.
 *
 * @returns the locale.
 */
export function useDateLocale(): Locale {
  return dateLocale(useUserLocale()) ?? fr;
}
