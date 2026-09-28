import { DatabaseFieldType } from "@shared/databases/types";
import { PARIS, evaluate, makeField } from "../../testFixtures";

const fields = [
  makeField({
    id: "start",
    type: DatabaseFieldType.Date,
    options: {
      formatting: { date: "D MMMM YYYY", time: "None", timeZone: PARIS },
    },
  }),
  makeField({ id: "end", type: DatabaseFieldType.Date }),
  makeField({ id: "blank", type: DatabaseFieldType.Date }),
  makeField({ id: "text", type: DatabaseFieldType.SingleLineText }),
];
// 19 March 2025 and 16 May 2025 at midnight in Paris (winter, then summer time).
const cells = {
  start: "2025-03-18T23:00:00.000Z",
  end: "2025-05-15T22:00:00.000Z",
  blank: null,
  text: "2025-07-01 14:30",
};
const NOW = "2025-06-15T10:30:00.000Z";
const run = (expression: string) =>
  evaluate(expression, { fields, cells, now: NOW });
const iso = (expression: string) => {
  const { value } = run(expression);
  return typeof value === "number" ? new Date(value).toISOString() : value;
};

describe("date functions", () => {
  it("gives today at midnight and now in the formula's zone", () => {
    expect(iso("TODAY()")).toBe("2025-06-14T22:00:00.000Z");
    expect(iso("NOW()")).toBe(NOW);
    expect(run("TODAY()").type).toEqual({
      type: "dateTime",
      isMultiple: false,
    });
  });

  it("reads date parts on the wall clock of the zone", () => {
    expect(run("YEAR({start})").value).toBe(2025);
    expect(run("MONTH({start})").value).toBe(3);
    expect(run("DAY({start})").value).toBe(19);
    expect(run("HOUR({start})").value).toBe(0);
    expect(run("WEEKDAY({start})").value).toBe(3);
    expect(run('WEEKDAY({start}, "monday")').value).toBe(2);
    expect(run("WEEKNUM({start})").value).toBe(12);
    expect(run("YEAR({blank})").value).toBeNull();
  });

  it("counts differences on the wall clock, whole months and years", () => {
    expect(run('DATETIME_DIFF({end}, {start}, "day")').value).toBe(58);
    expect(run('DATETIME_DIFF({end}, {start}, "days")').value).toBe(58);
    expect(run('DATETIME_DIFF({start}, {end}, "week")').value).toBeCloseTo(
      -58 / 7,
      10
    );
    expect(run('DATETIME_DIFF({end}, {start}, "month")').value).toBe(1);
    expect(run('DATETIME_DIFF({end}, {start}, "hour")').value).toBe(58 * 24);
    expect(run("DATETIME_DIFF({end}, {start})").value).toBe(58 * 86400);
    expect(run('DATETIME_DIFF({end}, {start}, "unknown")').value).toBe(58);
    expect(run('DATETIME_DIFF(NOW(), {blank}, "day")').value).toBeNull();
    expect(
      run(
        'DATETIME_DIFF(DATETIME_PARSE("2026-02-28"), DATETIME_PARSE("2025-01-31"), "year")'
      ).value
    ).toBe(1);
  });

  it("adds units keeping the time of day across a daylight saving change", () => {
    expect(iso('DATE_ADD({start}, 30, "days")')).toBe(
      "2025-04-17T22:00:00.000Z"
    );
    expect(iso('DATE_ADD({start}, -1, "month")')).toBe(
      "2025-02-18T23:00:00.000Z"
    );
    expect(iso('DATE_ADD(DATETIME_PARSE("2025-01-31"), 1, "month")')).toBe(
      "2025-02-27T23:00:00.000Z"
    );
    expect(iso('DATE_ADD({start}, 2, "hours")')).toBe(
      "2025-03-19T01:00:00.000Z"
    );
  });

  it("formats and parses dates in French, in the zone", () => {
    expect(run('DATETIME_FORMAT({start}, "D MMMM YYYY")').value).toBe(
      "19 mars 2025"
    );
    expect(run('DATETIME_FORMAT({start}, "dddd Do MMM YY")').value).toBe(
      "mercredi 19 mars 25"
    );
    expect(run("DATETIME_FORMAT({start})").value).toBe("2025-03-19 00:00");
    expect(run('DATETIME_FORMAT({start}, "[Semaine] Q")').value).toBe(
      "Semaine 1"
    );
    expect(iso("DATETIME_PARSE({text})")).toBe("2025-07-01T12:30:00.000Z");
    expect(iso('DATETIME_PARSE("2026-09-28T08:07:40.510Z")')).toBe(
      "2026-09-28T08:07:40.510Z"
    );
    expect(iso('DATETIME_PARSE("18/03/2025", "DD/MM/YYYY")')).toBe(
      "2025-03-17T23:00:00.000Z"
    );
    expect(iso('DATETIME_PARSE("1 juillet 2025")')).toBe(
      "2025-06-30T22:00:00.000Z"
    );
    expect(run('DATETIME_PARSE("not a date")').value).toBeNull();
    expect(run("DATESTR({start})").value).toBe("2025-03-19");
    expect(run("TIMESTR({start})").value).toBe("00:00:00");
  });

  it("compares dates by unit and counts working days", () => {
    expect(
      run('IS_SAME({start}, DATE_ADD({start}, 3, "hour"), "day")').value
    ).toBe(true);
    expect(run("IS_SAME({start}, {end})").value).toBe(false);
    expect(run("IS_AFTER({end}, {start})").value).toBe(true);
    expect(run("IS_BEFORE({end}, {start})").value).toBe(false);
    expect(iso("WORKDAY({start}, 3)")).toBe("2025-03-23T23:00:00.000Z");
    expect(
      run('WORKDAY_DIFF({start}, DATE_ADD({start}, 7, "day"))').value
    ).toBe(5);
    expect(run('FROMNOW({start}, "day")').value).toBeCloseTo(
      88 + 12.5 / 24,
      10
    );
  });

  it("reads the record's times", () => {
    expect(iso("CREATED_TIME()")).toBe("2025-01-01T09:00:00.000Z");
    expect(iso("LAST_MODIFIED_TIME()")).toBe("2025-01-02T09:00:00.000Z");
    expect(run("RECORD_ID()").value).toBe("recTest");
    expect(run("AUTO_NUMBER()").value).toBe(7);
  });
});
