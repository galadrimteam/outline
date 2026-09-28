import type { TFunction } from "i18next";
import type {
  DatabaseField,
  DatabaseStatisticFunc,
} from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import { bytesToHumanReadable } from "@shared/utils/files";
import {
  dateFormatting,
  formatDateValue,
  formatNumber,
} from "../../cells/format";

const PERCENT_FUNCS: DatabaseStatisticFunc[] = [
  "percentEmpty",
  "percentFilled",
  "percentUnique",
  "percentChecked",
  "percentUnChecked",
];

const COUNT_FUNCS: DatabaseStatisticFunc[] = [
  "count",
  "empty",
  "filled",
  "unique",
  "checked",
  "unChecked",
];

/**
 * The calculations a column footer offers for a field, in the engine's order (after
 * `getValidStatisticFunc` of `@teable/core`, MIT).
 *
 * @param field the field.
 * @returns the statistic functions.
 */
export function statisticFuncsFor(
  field: DatabaseField
): DatabaseStatisticFunc[] {
  const basic: DatabaseStatisticFunc[] = [
    "count",
    "empty",
    "filled",
    "percentEmpty",
    "percentFilled",
  ];

  if (field.type === DatabaseFieldType.Link) {
    return basic;
  }
  if (
    field.type === DatabaseFieldType.User ||
    field.type === DatabaseFieldType.CreatedBy ||
    field.type === DatabaseFieldType.LastModifiedBy
  ) {
    return field.isMultipleCellValue
      ? basic
      : [
          "count",
          "empty",
          "filled",
          "unique",
          "percentEmpty",
          "percentFilled",
          "percentUnique",
        ];
  }

  let funcs: DatabaseStatisticFunc[];
  switch (field.cellValueType) {
    case "number":
      funcs = [
        "sum",
        "average",
        "min",
        "max",
        "count",
        "empty",
        "filled",
        "unique",
        "percentEmpty",
        "percentFilled",
        "percentUnique",
      ];
      break;
    case "dateTime":
      funcs = [
        "count",
        "empty",
        "filled",
        "unique",
        "percentEmpty",
        "percentFilled",
        "percentUnique",
        "earliestDate",
        "latestDate",
        "dateRangeOfDays",
        "dateRangeOfMonths",
      ];
      break;
    case "boolean":
      funcs = [
        "count",
        "checked",
        "unChecked",
        "percentChecked",
        "percentUnChecked",
      ];
      break;
    default:
      funcs = [
        "count",
        "empty",
        "filled",
        "unique",
        "percentEmpty",
        "percentFilled",
        "percentUnique",
      ];
  }

  if (field.type === DatabaseFieldType.Attachment) {
    return [
      ...funcs.filter((func) => func !== "unique" && func !== "percentUnique"),
      "totalAttachmentSize",
    ];
  }
  return funcs;
}

/**
 * The name of a calculation in the footer menu.
 *
 * @param func the statistic function.
 * @param t the translation function.
 * @returns the label.
 */
export function statisticLabel(
  func: DatabaseStatisticFunc,
  t: TFunction
): string {
  switch (func) {
    case "count":
      return t("Count all");
    case "empty":
      return t("Count empty");
    case "filled":
      return t("Count not empty");
    case "unique":
      return t("Count unique values");
    case "max":
      return t("Max");
    case "min":
      return t("Min");
    case "sum":
      return t("Sum");
    case "average":
      return t("Average");
    case "checked":
      return t("Checked");
    case "unChecked":
      return t("Unchecked");
    case "percentEmpty":
      return t("Percent empty");
    case "percentFilled":
      return t("Percent not empty");
    case "percentUnique":
      return t("Percent unique values");
    case "percentChecked":
      return t("Percent checked");
    case "percentUnChecked":
      return t("Percent unchecked");
    case "earliestDate":
      return t("Earliest date");
    case "latestDate":
      return t("Latest date");
    case "dateRangeOfDays":
      return t("Date range (days)");
    case "dateRangeOfMonths":
      return t("Date range (months)");
    case "totalAttachmentSize":
      return t("Total size");
  }
}

/**
 * The short name shown before a result in the footer ("Sum 12").
 *
 * @param func the statistic function.
 * @param t the translation function.
 * @returns the short label.
 */
export function statisticShortLabel(
  func: DatabaseStatisticFunc,
  t: TFunction
): string {
  switch (func) {
    case "count":
      return t("Count");
    case "empty":
    case "percentEmpty":
      return t("Empty");
    case "filled":
    case "percentFilled":
      return t("Not empty");
    case "unique":
    case "percentUnique":
      return t("Unique");
    case "checked":
    case "percentChecked":
      return t("Checked");
    case "unChecked":
    case "percentUnChecked":
      return t("Unchecked");
    case "earliestDate":
      return t("Earliest");
    case "latestDate":
      return t("Latest");
    case "dateRangeOfDays":
    case "dateRangeOfMonths":
      return t("Range");
    case "totalAttachmentSize":
      return t("Size");
    default:
      return statisticLabel(func, t);
  }
}

/**
 * Formats the result of a calculation: counts as integers, percentages with a sign, sums and
 * extremes with the field's number format, dates as the field shows them.
 *
 * @param func the statistic function.
 * @param value the result from the engine.
 * @param field the field.
 * @param t the translation function.
 * @param locale the reader's locale.
 * @returns the text, "" when there is no result.
 */
export function formatStatistic(
  func: DatabaseStatisticFunc,
  value: number | string | null | undefined,
  field: DatabaseField,
  t: TFunction,
  locale?: string
): string {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  if (func === "earliestDate" || func === "latestDate") {
    return typeof value === "string"
      ? formatDateValue(value, dateFormatting(field), locale)
      : String(value);
  }

  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    return String(value);
  }

  if (PERCENT_FUNCS.includes(func)) {
    return formatNumber(
      number / 100,
      { type: "percent", precision: 0 },
      locale
    );
  }
  if (COUNT_FUNCS.includes(func)) {
    return formatNumber(number, { type: "decimal", precision: 0 }, locale);
  }
  if (func === "dateRangeOfDays") {
    return t("{{ count }} days", { count: Math.round(number) });
  }
  if (func === "dateRangeOfMonths") {
    return t("{{ count }} months", { count: Math.round(number) });
  }
  if (func === "totalAttachmentSize") {
    return bytesToHumanReadable(number);
  }
  if (func === "average" && field.options.formatting?.precision === undefined) {
    return formatNumber(number, { type: "decimal", precision: 2 }, locale);
  }
  return formatNumber(number, field.options.formatting, locale);
}
