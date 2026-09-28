import type { DatabaseFieldOptions } from "@shared/databases/types";
import { DatabaseFieldType } from "@shared/databases/types";
import type { EngineFieldRow, TableSnapshot } from "../../types";
import {
  PARIS,
  contextAt,
  formulaField,
  makeField,
  makeRecord,
  makeTable,
} from "../testFixtures";
import { computeBase } from "./computeBase";
import { inferFieldType } from "./inferType";

/*
 * Every formula, rollup and lookup of the local Teable (September 2026), with
 * their field ids, expressions and the types Teable inferred, rebuilt as a
 * base of twelve tables (the MGE project: tickets, epics, estimates, quotes;
 * a course catalogue linked on three levels).
 */

const dateOptions: DatabaseFieldOptions = {
  formatting: { date: "D MMMM YYYY", time: "None", timeZone: PARIS },
};
const dateTimeOptions: DatabaseFieldOptions = {
  formatting: { date: "D MMMM YYYY", time: "HH:mm", timeZone: PARIS },
};
const decimal = (precision: number): DatabaseFieldOptions => ({
  formatting: { type: "decimal", precision },
});

const text = (id: string, name = id) =>
  makeField({ id, name, type: DatabaseFieldType.SingleLineText });
const number = (id: string, precision = 2) =>
  makeField({
    id,
    type: DatabaseFieldType.Number,
    options: decimal(precision),
  });
const date = (id: string, options = dateOptions) =>
  makeField({ id, type: DatabaseFieldType.Date, options });
const link = (id: string, foreignTableId: string, lookupFieldId: string) =>
  makeField({
    id,
    type: DatabaseFieldType.Link,
    options: { foreignTableId, lookupFieldId, relationship: "manyMany" },
  });
const select = (id: string, names: string[]) =>
  makeField({
    id,
    type: DatabaseFieldType.SingleSelect,
    options: { choices: names.map((name) => ({ name, color: "gray" })) },
  });
const rollup = (
  id: string,
  expression: string,
  foreignTableId: string,
  linkFieldId: string,
  lookupFieldId: string,
  cellValueType: EngineFieldRow["cellValueType"],
  isMultipleCellValue = false,
  options: DatabaseFieldOptions = {}
) =>
  makeField({
    id,
    type: DatabaseFieldType.Rollup,
    isComputed: true,
    cellValueType,
    isMultipleCellValue,
    options: { expression, timeZone: PARIS, ...options },
    lookupOptions: { foreignTableId, linkFieldId, lookupFieldId },
  });
const lookup = (
  id: string,
  foreignTableId: string,
  linkFieldId: string,
  lookupFieldId: string
) =>
  makeField({
    id,
    type: DatabaseFieldType.Link,
    isLookup: true,
    isComputed: true,
    cellValueType: "string",
    isMultipleCellValue: true,
    options: { foreignTableId, relationship: "manyMany" },
    lookupOptions: { foreignTableId, linkFieldId, lookupFieldId },
  });

const CALENDAR = "tblCsxggOZ3B4yFCyJc";
const KANBAN = "tblKSoV6bmVEQ73nXtQ";
const ESTIMATES = "tblLfZNmu4XcG5TSmck";
const GANTT = "tblWB6TAr9sFLcFRDaS";
const TICKETS = "tblwjVoK6wB0zapBe5R";
const POINTS = "tbllWRmTRLYtDPvD7Rp";
const QUOTES = "tblskEnqtyvcv5rCnCU";
const MISSION = "tblwPDlLy7ZJfw1oOCp";
const CHAPTERS = "tblNPSKprbjs4su1lzg";
const CONTENTS = "tblbIPi0trCeYAF7Z47";
const THEMES = "tblzAoIa0yXu0VoCWPb";
const CLASSES = "tbljarLMoX60Oud8sxJ";

const users = {
  ada: { id: "user-ada", title: "Ada" },
  bob: { id: "user-bob", title: "Bob" },
};

const calendar = makeTable(
  CALENDAR,
  [
    text("fldp67hVDeSaoL9ELqY", "Nom"),
    date("fld4XB2aG5MdbN7Chz2"),
    date("fldSoKDmOCRRHLldacX"),
    formulaField(
      "fld3ulSYPwcJ3oWAZy8",
      'ROUND(IF(DATETIME_DIFF({fldSoKDmOCRRHLldacX}, {fld4XB2aG5MdbN7Chz2}, "day") >= 0, FLOOR(DATETIME_DIFF({fldSoKDmOCRRHLldacX}, {fld4XB2aG5MdbN7Chz2}, "day")), CEILING(DATETIME_DIFF({fldSoKDmOCRRHLldacX}, {fld4XB2aG5MdbN7Chz2}, "day"))) / 7 * 10, 0) / 10',
      "number",
      { options: decimal(2) }
    ),
    formulaField(
      "fldzhjXJml1RYprWFuS",
      'IF({fldSoKDmOCRRHLldacX} < TODAY(), {fld3ulSYPwcJ3oWAZy8}, IF({fld4XB2aG5MdbN7Chz2} > TODAY(), "Starting Soon...", ROUND(IF(DATETIME_DIFF(TODAY(), {fld4XB2aG5MdbN7Chz2}, "day") >= 0, FLOOR(DATETIME_DIFF(TODAY(), {fld4XB2aG5MdbN7Chz2}, "day")), CEILING(DATETIME_DIFF(TODAY(), {fld4XB2aG5MdbN7Chz2}, "day"))) / 7 * 10, 0) / 10))',
      "string"
    ),
    formulaField(
      "fldj34nLgpq3Ye78hzU",
      'ROUND({fldzhjXJml1RYprWFuS} / {fld3ulSYPwcJ3oWAZy8} * 10000, 0) / 100 + "%"',
      "string"
    ),
    link("fld7gy2oUQFo7iuH3og", CALENDAR, "fldp67hVDeSaoL9ELqY"),
  ],
  [
    makeRecord("recCal1", {
      fldp67hVDeSaoL9ELqY: "Conception",
      fld4XB2aG5MdbN7Chz2: "2025-03-18T23:00:00.000Z",
    }),
    makeRecord("recCal2", {
      fldp67hVDeSaoL9ELqY: "Sprint 1",
      fld4XB2aG5MdbN7Chz2: "2025-03-18T23:00:00.000Z",
      fldSoKDmOCRRHLldacX: "2025-05-15T22:00:00.000Z",
      fld7gy2oUQFo7iuH3og: [{ id: "recCal3" }, { id: "recGone" }],
    }),
    makeRecord("recCal3", {
      fldp67hVDeSaoL9ELqY: "Sprint 2",
      fld4XB2aG5MdbN7Chz2: "2025-05-18T22:00:00.000Z",
      fldSoKDmOCRRHLldacX: "2025-07-02T22:00:00.000Z",
    }),
    makeRecord("recCal4", {
      fldp67hVDeSaoL9ELqY: "Plus tard",
      fld4XB2aG5MdbN7Chz2: "2027-01-01T00:00:00.000Z",
    }),
    makeRecord("recCal5", { fldp67hVDeSaoL9ELqY: "Vide" }),
  ]
);

const kanban = makeTable(
  KANBAN,
  [
    text("fldfu8ZBmnMfgyd0NjE", "Ticket"),
    number("fldHA7efRtWDiAFa5Vg"),
    number("fldjqP8IYguQTSeLG7m"),
    formulaField(
      "fldLIuLgn6ek5NoZR6a",
      "IF({fldjqP8IYguQTSeLG7m} > 0, {fldjqP8IYguQTSeLG7m} - {fldHA7efRtWDiAFa5Vg}, BLANK())",
      "number"
    ),
    formulaField("fldL9b8DdjYhoGJhPVy", "{fldHA7efRtWDiAFa5Vg}", "number"),
  ],
  [
    makeRecord("recKan1", { fldHA7efRtWDiAFa5Vg: 3, fldjqP8IYguQTSeLG7m: 5 }),
    makeRecord("recKan2", { fldHA7efRtWDiAFa5Vg: 3 }),
    makeRecord("recKan3", { fldjqP8IYguQTSeLG7m: 2 }),
  ]
);

const tickets = makeTable(
  TICKETS,
  [
    text("fldPmoAkcvqA9oObbLe", "Ticket"),
    number("fldaSNkha5i4XkmIPza"),
    number("fldj18gaQjMnBGoraxw"),
    select("fldvD9SlHjFRFVtNRcl", ["Backlog Design", "En cours", "Terminé"]),
    date("fld5ga8kXmBbdQjBOHL"),
    date("fldt2lGpiYRRM3pavEg"),
    date("flduzG4KXIszD3WSgTk"),
    date("fld6AqDVbVn6mshydnb"),
    date("fldvueUbXJiIniUM1zP", dateTimeOptions),
    makeField({
      id: "fld1IJVPGaS5rdBa3Rc",
      type: DatabaseFieldType.User,
      options: { isMultiple: true },
    }),
    link("fldY0yXNnVtQ26YuaZA", GANTT, "fldMtV13mafRSYSQ5hP"),
    formulaField("fldxdpR38UPvuqgmays", "{fldaSNkha5i4XkmIPza}", "number"),
    formulaField(
      "fldQTaNhCj1Tr84lTg3",
      'IF({fldvD9SlHjFRFVtNRcl} = "Terminé", {fldaSNkha5i4XkmIPza}, 0)',
      "number"
    ),
    formulaField(
      "fldaRTJK75DTKznguqZ",
      "IF({fldj18gaQjMnBGoraxw} > 0, {fldj18gaQjMnBGoraxw} - {fldxdpR38UPvuqgmays}, 0)",
      "number"
    ),
    formulaField(
      "fldVb3EjbpQ4mAT19ux",
      'IF(NOT({fldj18gaQjMnBGoraxw}), "", IF({fldaRTJK75DTKznguqZ} >= 5, "Très sous-estimé", IF({fldaRTJK75DTKznguqZ} >= 3, "Sous-estimé", IF({fldaRTJK75DTKznguqZ} >= 1, "Légèrement sous-estimé", IF({fldaRTJK75DTKznguqZ} >= -1, "RAS", IF({fldaRTJK75DTKznguqZ} >= -3, "Légèrement sur-estimé", IF({fldaRTJK75DTKznguqZ} >= -5, "Sur-estimé", "Très sur-estimé")))))))',
      "string"
    ),
    formulaField(
      "fldnQNrkxGTSLSLBu1F",
      "IF(LAST_MODIFIED_TIME() > DATETIME_PARSE('2026-09-28T08:11:26.639Z'), LAST_MODIFIED_TIME(), {fldvueUbXJiIniUM1zP})",
      "dateTime",
      { options: dateTimeOptions }
    ),
    formulaField(
      "fldthL7YItjqkgl2TMS",
      "IF(NOT({fld6AqDVbVn6mshydnb}), {fldt2lGpiYRRM3pavEg}, {fld6AqDVbVn6mshydnb})",
      "dateTime",
      { options: dateOptions }
    ),
    formulaField(
      "fldrfqVaLC2tBh6Rrxv",
      "IF(NOT({flduzG4KXIszD3WSgTk}), {fld5ga8kXmBbdQjBOHL}, {flduzG4KXIszD3WSgTk})",
      "dateTime",
      { options: dateOptions }
    ),
  ],
  [
    makeRecord(
      "recTic1",
      {
        fldPmoAkcvqA9oObbLe: "Je peux voir les élèves",
        fldaSNkha5i4XkmIPza: 2,
        fldj18gaQjMnBGoraxw: 3,
        fldvD9SlHjFRFVtNRcl: "Terminé",
        flduzG4KXIszD3WSgTk: "2026-09-18T22:00:00.000Z",
        fld6AqDVbVn6mshydnb: "2026-09-24T22:00:00.000Z",
        fldvueUbXJiIniUM1zP: "2026-01-10T15:04:00.000Z",
        fld1IJVPGaS5rdBa3Rc: [users.ada, users.bob],
        fldY0yXNnVtQ26YuaZA: [{ id: "recEpic1" }],
      },
      { lastModifiedTime: "2026-09-28T09:00:00.000Z" }
    ),
    makeRecord("recTic2", {
      fldPmoAkcvqA9oObbLe: "Je peux voir les alertes",
      fldaSNkha5i4XkmIPza: 3,
      fldvD9SlHjFRFVtNRcl: "En cours",
      fld5ga8kXmBbdQjBOHL: "2026-09-21T22:00:00.000Z",
      fldt2lGpiYRRM3pavEg: "2026-10-01T22:00:00.000Z",
      fldvueUbXJiIniUM1zP: "2026-02-03T08:30:00.000Z",
      fld1IJVPGaS5rdBa3Rc: [users.bob],
      fldY0yXNnVtQ26YuaZA: [{ id: "recEpic1" }],
    }),
  ]
);

const gantt = makeTable(
  GANTT,
  [
    text("fldMtV13mafRSYSQ5hP", "EPIC"),
    link("fldUmsi2Bf9K1Hw33su", TICKETS, "fldPmoAkcvqA9oObbLe"),
    rollup(
      "fldiOQjNpXMc2zhu347",
      "array_unique({values})",
      TICKETS,
      "fldUmsi2Bf9K1Hw33su",
      "fld1IJVPGaS5rdBa3Rc",
      "string",
      true
    ),
    rollup(
      "fldh1hJAOxczH2gXBBx",
      "max({values})",
      TICKETS,
      "fldUmsi2Bf9K1Hw33su",
      "fldthL7YItjqkgl2TMS",
      "dateTime",
      false,
      dateOptions
    ),
    rollup(
      "fldYSRYMfaqlFDyQX8B",
      "min({values})",
      TICKETS,
      "fldUmsi2Bf9K1Hw33su",
      "fldrfqVaLC2tBh6Rrxv",
      "dateTime",
      false,
      dateOptions
    ),
    rollup(
      "fldfigmjCRtcQ9yxIgD",
      "sum({values})",
      TICKETS,
      "fldUmsi2Bf9K1Hw33su",
      "fldQTaNhCj1Tr84lTg3",
      "number"
    ),
    rollup(
      "fldeKrsr7wJautRMMH5",
      "sum({values})",
      TICKETS,
      "fldUmsi2Bf9K1Hw33su",
      "fldaSNkha5i4XkmIPza",
      "number"
    ),
    formulaField("fldgqNoAOhGxSMBRodO", "{fldYSRYMfaqlFDyQX8B}", "dateTime", {
      options: dateOptions,
    }),
    formulaField("fldZ6T7CBshkD5XNytF", "{fldh1hJAOxczH2gXBBx}", "dateTime", {
      options: dateOptions,
    }),
    formulaField(
      "fldtlgbKXRTOrdeYiyt",
      'IF(DATETIME_DIFF(NOW(), {fldYSRYMfaqlFDyQX8B}, "day") >= 0, FLOOR(DATETIME_DIFF(NOW(), {fldYSRYMfaqlFDyQX8B}, "day")), CEILING(DATETIME_DIFF(NOW(), {fldYSRYMfaqlFDyQX8B}, "day"))) / IF(DATETIME_DIFF({fldh1hJAOxczH2gXBBx}, {fldYSRYMfaqlFDyQX8B}, "day") >= 0, FLOOR(DATETIME_DIFF({fldh1hJAOxczH2gXBBx}, {fldYSRYMfaqlFDyQX8B}, "day")), CEILING(DATETIME_DIFF({fldh1hJAOxczH2gXBBx}, {fldYSRYMfaqlFDyQX8B}, "day")))',
      "number"
    ),
    formulaField(
      "fldmNQrpBHPvCWyrPGM",
      "{fldfigmjCRtcQ9yxIgD} / {fldeKrsr7wJautRMMH5}",
      "number"
    ),
  ],
  [
    makeRecord("recEpic1", {
      fldMtV13mafRSYSQ5hP: "Pilotage",
      fldUmsi2Bf9K1Hw33su: [{ id: "recTic1" }, { id: "recTic2" }],
    }),
    makeRecord("recEpic2", { fldMtV13mafRSYSQ5hP: "Messagerie" }),
  ]
);

const estimates = makeTable(
  ESTIMATES,
  [
    text("fldVIyOAj09sfZjNVMB", "Nom"),
    number("fld9rShl0ebBKNwMdKf", 0),
    select("fldje5SwqsauIqQ6EFX", [
      "Dev IA",
      "Dev FS",
      "Design",
      "Cadrage (PM)",
      "Cadrage (Tech Lead)",
    ]),
    link("fldO9ssUK8Osk0HkiIz", TICKETS, "fldPmoAkcvqA9oObbLe"),
    rollup(
      "fld5xczkL5Y8gNMSGiC",
      "sum({values})",
      TICKETS,
      "fldO9ssUK8Osk0HkiIz",
      "fldaSNkha5i4XkmIPza",
      "number"
    ),
    formulaField(
      "fldeHyNeZ6Cqu1pvV89",
      "IF(NOT({fld9rShl0ebBKNwMdKf}), {fld5xczkL5Y8gNMSGiC} / 5, {fld9rShl0ebBKNwMdKf})",
      "number"
    ),
    formulaField(
      "fldYtDvRxNcE1LWenXi",
      'IF({fldje5SwqsauIqQ6EFX} = "Design", {fldeHyNeZ6Cqu1pvV89} * 500, IF({fldje5SwqsauIqQ6EFX} = "Dev FS", {fldeHyNeZ6Cqu1pvV89} / 5 * 4000, IF({fldje5SwqsauIqQ6EFX} = "Cadrage (PM)", {fldeHyNeZ6Cqu1pvV89} * 600, IF({fldje5SwqsauIqQ6EFX} = "Cadrage (Tech Lead)", {fldeHyNeZ6Cqu1pvV89} * 700, {fldeHyNeZ6Cqu1pvV89} / 5 * 4500))))',
      "number"
    ),
  ],
  [
    makeRecord("recEst1", {
      fldVIyOAj09sfZjNVMB: "Maquettes",
      fldje5SwqsauIqQ6EFX: "Design",
      fldO9ssUK8Osk0HkiIz: [{ id: "recTic1" }, { id: "recTic2" }],
    }),
    makeRecord("recEst2", {
      fldVIyOAj09sfZjNVMB: "API",
      fld9rShl0ebBKNwMdKf: 2,
      fldje5SwqsauIqQ6EFX: "Dev FS",
    }),
  ]
);

const quotes = makeTable(
  QUOTES,
  [
    text("fldAnITrhV0l2FWdqSa", "Nom"),
    link("fldvsuexEkEKUj0C1s6", ESTIMATES, "fldVIyOAj09sfZjNVMB"),
    rollup(
      "fldrDFCSTQwbFIBtxZZ",
      "sum({values})",
      ESTIMATES,
      "fldvsuexEkEKUj0C1s6",
      "fldYtDvRxNcE1LWenXi",
      "number",
      false,
      { formatting: { type: "currency", symbol: "€", precision: 0 } }
    ),
  ],
  [
    makeRecord("recQuote1", {
      fldAnITrhV0l2FWdqSa: "V1",
      fldvsuexEkEKUj0C1s6: [{ id: "recEst1" }, { id: "recEst2" }],
    }),
  ]
);

const points = makeTable(
  POINTS,
  [
    text("fldRk3xV9FP54tudJJq", "Nom"),
    date("fldow7bncGkcz5kYDIz", dateTimeOptions),
    formulaField(
      "fldv1Av6VfrS50pShnZ",
      "IF(CREATED_TIME() > DATETIME_PARSE('2026-09-28T08:07:40.510Z'), CREATED_TIME(), {fldow7bncGkcz5kYDIz})",
      "dateTime",
      { options: dateTimeOptions }
    ),
  ],
  [
    makeRecord(
      "recPoint1",
      { fldRk3xV9FP54tudJJq: "Nouveau" },
      { createdTime: "2026-09-28T09:00:00.000Z" }
    ),
    makeRecord(
      "recPoint2",
      {
        fldRk3xV9FP54tudJJq: "Importé",
        fldow7bncGkcz5kYDIz: "2025-11-02T10:00:00.000Z",
      },
      { createdTime: "2026-01-01T00:00:00.000Z" }
    ),
  ]
);

const mission = makeTable(
  MISSION,
  [
    text("fldF6KIIbR9ySySiWQK", "Nom"),
    number("fldUyNfhNzKoCFzj6Gh"),
    number("fldfk3tvi7UbCrfSrf2", 1),
    link("fldRV0x0WhHl6AM10Kp", MISSION, "fldF6KIIbR9ySySiWQK"),
    rollup(
      "fldCrpFbcUdq9k7wnKt",
      "sum({values})",
      MISSION,
      "fldRV0x0WhHl6AM10Kp",
      "fldUyNfhNzKoCFzj6Gh",
      "number"
    ),
    rollup(
      "fldB2zJL5cYsqbx47wd",
      "sum({values})",
      MISSION,
      "fldRV0x0WhHl6AM10Kp",
      "fldfk3tvi7UbCrfSrf2",
      "number"
    ),
    formulaField("fldBeSfxlZDaxEt5ZSt", "{fldB2zJL5cYsqbx47wd} / 25", "number"),
  ],
  [
    makeRecord("recParent", {
      fldF6KIIbR9ySySiWQK: "Espace élève",
      fldRV0x0WhHl6AM10Kp: [{ id: "recChild1" }, { id: "recChild2" }],
    }),
    makeRecord("recChild1", {
      fldF6KIIbR9ySySiWQK: "Connexion",
      fldUyNfhNzKoCFzj6Gh: 2,
      fldfk3tvi7UbCrfSrf2: 1.5,
    }),
    makeRecord("recChild2", {
      fldF6KIIbR9ySySiWQK: "Profil",
      fldfk3tvi7UbCrfSrf2: 2.5,
    }),
  ]
);

const classes = makeTable(
  CLASSES,
  [text("fld06nkKFab1Q3rnWQ9", "Nom")],
  [
    makeRecord("recClass1", { fld06nkKFab1Q3rnWQ9: "Seconde" }),
    makeRecord("recClass2", { fld06nkKFab1Q3rnWQ9: "Première" }),
  ]
);

const themes = makeTable(
  THEMES,
  [
    text("fldMylTLgzztrVjzxT5", "Nom"),
    link("fldOtf8uJrsR6W3jdCe", CLASSES, "fld06nkKFab1Q3rnWQ9"),
  ],
  [
    makeRecord("recTheme1", {
      fldMylTLgzztrVjzxT5: "Thème 1",
      fldOtf8uJrsR6W3jdCe: [{ id: "recClass1" }],
    }),
    makeRecord("recTheme2", {
      fldMylTLgzztrVjzxT5: "Thème 2",
      fldOtf8uJrsR6W3jdCe: [{ id: "recClass1" }, { id: "recClass2" }],
    }),
  ]
);

const chapters = makeTable(
  CHAPTERS,
  [
    text("fldFLQijC9q8mR4OcHT", "Nom"),
    link("fldcHbc3gIuxURU3Lpu", THEMES, "fldMylTLgzztrVjzxT5"),
    lookup(
      "fldR4NtbyxxjUqXByt3",
      THEMES,
      "fldcHbc3gIuxURU3Lpu",
      "fldOtf8uJrsR6W3jdCe"
    ),
  ],
  [
    makeRecord("recChap1", {
      fldFLQijC9q8mR4OcHT: "Chapitre 1",
      fldcHbc3gIuxURU3Lpu: [{ id: "recTheme1" }, { id: "recTheme2" }],
    }),
  ]
);

const contents = makeTable(
  CONTENTS,
  [
    text("flduucZvohDjZgFspGo", "Nom"),
    link("fld2eRrYZtALuA7bCb6", CHAPTERS, "fldFLQijC9q8mR4OcHT"),
    lookup(
      "fldwr5AuvalaAR0faZx",
      CHAPTERS,
      "fld2eRrYZtALuA7bCb6",
      "fldcHbc3gIuxURU3Lpu"
    ),
  ],
  [
    makeRecord("recContent1", {
      flduucZvohDjZgFspGo: "Cours 1",
      fld2eRrYZtALuA7bCb6: [{ id: "recChap1" }],
    }),
  ]
);

const base: TableSnapshot[] = [
  calendar,
  kanban,
  tickets,
  gantt,
  estimates,
  quotes,
  points,
  mission,
  classes,
  themes,
  chapters,
  contents,
];

// The day the local Teable last computed these cells.
const context = contextAt("2026-09-28T10:00:00.000Z");
const computed = computeBase(base, context);
const cell = (tableId: string, recordId: string, fieldId: string) =>
  computed.record(tableId, recordId)?.cells[fieldId];

describe("the local Teable corpus", () => {
  it("types every formula, rollup and lookup as Teable did", () => {
    for (const table of base) {
      for (const field of table.fields.filter((item) => item.isComputed)) {
        const inferred = inferFieldType(field, table, base);
        expect(
          { field: field.id, ...inferred },
          `${table.table.id}.${field.id}`
        ).toEqual({
          field: field.id,
          cellValueType: field.cellValueType,
          isMultipleCellValue: field.isMultipleCellValue,
        });
      }
    }
  });

  it("computes the sprint calendar: weeks, progress text and percentage", () => {
    const row = (id: string) => [
      cell(CALENDAR, id, "fld3ulSYPwcJ3oWAZy8"),
      cell(CALENDAR, id, "fldzhjXJml1RYprWFuS"),
      cell(CALENDAR, id, "fldj34nLgpq3Ye78hzU"),
    ];
    expect(row("recCal1")).toEqual([0, "79.7", "0%"]);
    expect(row("recCal2")).toEqual([8.3, "8.3", "100%"]);
    expect(row("recCal3")).toEqual([6.4, "6.4", "100%"]);
    expect(row("recCal4")).toEqual([0, "Starting Soon...", "0%"]);
    expect(row("recCal5")).toEqual([0, "0", "0%"]);
  });

  it("titles links and drops links to deleted rows", () => {
    expect(cell(CALENDAR, "recCal2", "fld7gy2oUQFo7iuH3og")).toEqual([
      { id: "recCal3", title: "Sprint 2" },
    ]);
    expect(cell(CALENDAR, "recCal1", "fld7gy2oUQFo7iuH3og")).toBeNull();
  });

  it("computes the kanban differences with BLANK()", () => {
    expect(cell(KANBAN, "recKan1", "fldLIuLgn6ek5NoZR6a")).toBe(2);
    expect(cell(KANBAN, "recKan2", "fldLIuLgn6ek5NoZR6a")).toBeNull();
    expect(cell(KANBAN, "recKan3", "fldLIuLgn6ek5NoZR6a")).toBe(2);
    expect(cell(KANBAN, "recKan1", "fldL9b8DdjYhoGJhPVy")).toBe(3);
  });

  it("computes the tickets' date range, weight and estimate quality", () => {
    expect(cell(TICKETS, "recTic1", "fldrfqVaLC2tBh6Rrxv")).toBe(
      "2026-09-18T22:00:00.000Z"
    );
    expect(cell(TICKETS, "recTic1", "fldthL7YItjqkgl2TMS")).toBe(
      "2026-09-24T22:00:00.000Z"
    );
    expect(cell(TICKETS, "recTic2", "fldrfqVaLC2tBh6Rrxv")).toBe(
      "2026-09-21T22:00:00.000Z"
    );
    expect(cell(TICKETS, "recTic2", "fldthL7YItjqkgl2TMS")).toBe(
      "2026-10-01T22:00:00.000Z"
    );
    expect(cell(TICKETS, "recTic1", "fldQTaNhCj1Tr84lTg3")).toBe(2);
    expect(cell(TICKETS, "recTic2", "fldQTaNhCj1Tr84lTg3")).toBe(0);
    expect(cell(TICKETS, "recTic1", "fldaRTJK75DTKznguqZ")).toBe(1);
    expect(cell(TICKETS, "recTic2", "fldaRTJK75DTKznguqZ")).toBe(0);
    expect(cell(TICKETS, "recTic1", "fldVb3EjbpQ4mAT19ux")).toBe(
      "Légèrement sous-estimé"
    );
    expect(cell(TICKETS, "recTic2", "fldVb3EjbpQ4mAT19ux")).toBeNull();
  });

  it("keeps Notion's modification date until Outline modifies the row", () => {
    expect(cell(TICKETS, "recTic1", "fldnQNrkxGTSLSLBu1F")).toBe(
      "2026-09-28T09:00:00.000Z"
    );
    expect(cell(TICKETS, "recTic2", "fldnQNrkxGTSLSLBu1F")).toBe(
      "2026-02-03T08:30:00.000Z"
    );
    expect(cell(POINTS, "recPoint1", "fldv1Av6VfrS50pShnZ")).toBe(
      "2026-09-28T09:00:00.000Z"
    );
    expect(cell(POINTS, "recPoint2", "fldv1Av6VfrS50pShnZ")).toBe(
      "2025-11-02T10:00:00.000Z"
    );
  });

  it("rolls the tickets up into the Gantt, then computes on the rollups", () => {
    expect(cell(GANTT, "recEpic1", "fldYSRYMfaqlFDyQX8B")).toBe(
      "2026-09-18T22:00:00.000Z"
    );
    expect(cell(GANTT, "recEpic1", "fldh1hJAOxczH2gXBBx")).toBe(
      "2026-10-01T22:00:00.000Z"
    );
    expect(cell(GANTT, "recEpic1", "fldgqNoAOhGxSMBRodO")).toBe(
      "2026-09-18T22:00:00.000Z"
    );
    expect(cell(GANTT, "recEpic1", "fldZ6T7CBshkD5XNytF")).toBe(
      "2026-10-01T22:00:00.000Z"
    );
    expect(cell(GANTT, "recEpic1", "fldeKrsr7wJautRMMH5")).toBe(5);
    expect(cell(GANTT, "recEpic1", "fldfigmjCRtcQ9yxIgD")).toBe(2);
    expect(cell(GANTT, "recEpic1", "fldmNQrpBHPvCWyrPGM")).toBe(0.4);
    expect(cell(GANTT, "recEpic1", "fldtlgbKXRTOrdeYiyt")).toBeCloseTo(
      9 / 13,
      10
    );
    expect(cell(GANTT, "recEpic1", "fldiOQjNpXMc2zhu347")).toEqual([
      users.ada,
      users.bob,
    ]);
    expect(cell(GANTT, "recEpic1", "fldUmsi2Bf9K1Hw33su")).toEqual([
      { id: "recTic1", title: "Je peux voir les élèves" },
      { id: "recTic2", title: "Je peux voir les alertes" },
    ]);
  });

  it("gives an epic without tickets zero sums and no dates", () => {
    expect(cell(GANTT, "recEpic2", "fldeKrsr7wJautRMMH5")).toBe(0);
    expect(cell(GANTT, "recEpic2", "fldmNQrpBHPvCWyrPGM")).toBeNull();
    expect(cell(GANTT, "recEpic2", "fldYSRYMfaqlFDyQX8B")).toBeNull();
    expect(cell(GANTT, "recEpic2", "fldtlgbKXRTOrdeYiyt")).toBeNull();
    expect(cell(GANTT, "recEpic2", "fldiOQjNpXMc2zhu347")).toBeNull();
  });

  it("chains a rollup, two formulas and a rollup across three tables", () => {
    expect(cell(ESTIMATES, "recEst1", "fld5xczkL5Y8gNMSGiC")).toBe(5);
    expect(cell(ESTIMATES, "recEst1", "fldeHyNeZ6Cqu1pvV89")).toBe(1);
    expect(cell(ESTIMATES, "recEst1", "fldYtDvRxNcE1LWenXi")).toBe(500);
    expect(cell(ESTIMATES, "recEst2", "fld5xczkL5Y8gNMSGiC")).toBe(0);
    expect(cell(ESTIMATES, "recEst2", "fldeHyNeZ6Cqu1pvV89")).toBe(2);
    expect(cell(ESTIMATES, "recEst2", "fldYtDvRxNcE1LWenXi")).toBe(1600);
    expect(cell(QUOTES, "recQuote1", "fldrDFCSTQwbFIBtxZZ")).toBe(2100);
  });

  it("rolls up through a link of a table to itself", () => {
    expect(cell(MISSION, "recParent", "fldB2zJL5cYsqbx47wd")).toBe(4);
    expect(cell(MISSION, "recParent", "fldCrpFbcUdq9k7wnKt")).toBe(2);
    expect(cell(MISSION, "recParent", "fldBeSfxlZDaxEt5ZSt")).toBe(0.16);
    expect(cell(MISSION, "recChild1", "fldB2zJL5cYsqbx47wd")).toBe(0);
    expect(cell(MISSION, "recChild1", "fldBeSfxlZDaxEt5ZSt")).toBe(0);
  });

  it("looks links up through links, each row once", () => {
    expect(cell(CHAPTERS, "recChap1", "fldR4NtbyxxjUqXByt3")).toEqual([
      { id: "recClass1", title: "Seconde" },
      { id: "recClass2", title: "Première" },
    ]);
    expect(cell(CONTENTS, "recContent1", "fldwr5AuvalaAR0faZx")).toEqual([
      { id: "recTheme1", title: "Thème 1" },
      { id: "recTheme2", title: "Thème 2" },
    ]);
  });
});

/** The fields notion-formula.mjs writes, each once, as a Teable formula would use them. */
describe("the functions notion-formula.mjs emits", () => {
  const fields = [
    number("n"),
    text("t"),
    date("d"),
    makeField({ id: "l", type: DatabaseFieldType.Link }),
  ];
  const table = makeTable("tblEmit", [
    ...fields,
    formulaField("f", "1", "number"),
  ]);
  const expressions: [string, EngineFieldRow["cellValueType"]][] = [
    ["MOD({n}, 3)", "number"],
    ["POWER({n}, 1 / 3)", "number"],
    ['AND({n} > 1, NOT({t} = ""))', "boolean"],
    ["OR({n} = 1, {n} != 2)", "boolean"],
    ["IF({n} >= 0, FLOOR({n}), CEILING({n}))", "number"],
    ['VALUE({t} & "")', "number"],
    ['CONCATENATE({t}, " ", {n} & "")', "string"],
    ["LEN({t})", "number"],
    ["LOWER({t}) & UPPER({t}) & TRIM({t})", "string"],
    ["REPT({t}, 2)", "string"],
    ['FIND("a", {t}) > 0', "boolean"],
    ["MID({t}, 1 + 1, LEN({t}))", "string"],
    ['REGEXP_REPLACE({t}, "a", "b")', "string"],
    ["ROUND({n}, 2) + ABS({n}) + SQRT({n}) + EXP(0)", "number"],
    ["LOG({n}, 2.718281828459045) + LOG({n}, 10)", "number"],
    ["MIN({n}, 2) + MAX({n}, 2) + SUM({n}, 1) + AVERAGE({n}, 1)", "number"],
    ["NOW()", "dateTime"],
    ["TODAY()", "dateTime"],
    ['DATE_ADD({d}, -{n}, "month")', "dateTime"],
    [
      'IF(DATETIME_DIFF({d}, TODAY(), "week") >= 0, FLOOR(DATETIME_DIFF({d}, TODAY(), "week")), CEILING(DATETIME_DIFF({d}, TODAY(), "week")))',
      "number",
    ],
    ['DATETIME_FORMAT({d}, "D MMMM YYYY")', "string"],
    ['DATETIME_PARSE("2025-07-01T09:30")', "dateTime"],
    [
      "YEAR({d}) + MONTH({d}) + DAY({d}) + HOUR({d}) + MINUTE({d}) + WEEKNUM({d})",
      "number",
    ],
    ["IF(WEEKDAY({d}) = 0, 7, WEEKDAY({d}))", "number"],
    ["COUNTA({l}) = 0", "boolean"],
    ["IF({n} > 1, BLANK(), {d})", "dateTime"],
  ];

  it.each(expressions)("%s is a %s", (expression, type) => {
    const inferred = inferFieldType(
      {
        type: DatabaseFieldType.Formula,
        options: { expression },
        lookupOptions: null,
      },
      table,
      [table]
    );
    expect(inferred).toEqual({
      cellValueType: type,
      isMultipleCellValue: false,
    });
  });
});
