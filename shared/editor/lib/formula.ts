/**
 * Formulas in table columns, like Notion's formula properties (galadrim).
 *
 * A header cell may carry a formula (`th.attrs.formula`); every cell of that column below it shows the formula's
 * result for its row, where `prop("Column")` reads the cell of that row in the column named "Column". The language is
 * the subset of Notion's formula 2.0 that Galadrim's workspace uses, plus the most common functions: arithmetic,
 * comparisons, `if`, `and`/`or`/`not`, the `a ? b : c` ternary, method calls (`prop("Date").formatDate("DD/MM")`),
 * numbers, text, dates and check boxes.
 *
 * Cells have no type of their own: a value is read as a number, a date or a check box when its text is one
 * (French writing included: "1 200,50", "27 septembre 2026", "☑"), else as text. An empty cell is empty: 0 in
 * arithmetic, "" in text, false in a condition, like Notion.
 */

export type Value = number | string | boolean | Date | null;

/** A formula that cannot be read or cannot be computed; `message` is shown in the cell. */
export class FormulaError extends Error {}

// ---- reading cell values ---------------------------------------------------------------------------------------------

const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];
const MONTHS_EN = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const DAYS_FR = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
];

const NUMBER = /^[-+]?(\d{1,3}(?:[\s  ]\d{3})+|\d+)(?:[.,](\d+))?\s*(%?)$/;
const DATE_FR =
  /^(\d{1,2})(?:er)? ([a-zéû]+) (\d{4})(?: (\d{1,2})[:h](\d{2}))?$/i;
const DATE_EN =
  /^([a-z]+) (\d{1,2}), (\d{4})(?: (\d{1,2}):(\d{2}) ?(am|pm)?)?$/i;
const DATE_NUMERIC = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{1,2}):(\d{2}))?$/;
const DATE_ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;

/**
 * The value a cell's text stands for.
 *
 * @param text the text of the cell.
 * @returns a number, a date, a boolean (check box), text, or null when empty.
 */
export function readCell(text: string): Value {
  const raw = (text ?? "").trim();
  if (raw === "") {
    return null;
  }
  if (raw === "☑" || raw === "✅" || raw === "[x]") {
    return true;
  }
  if (raw === "☐" || raw === "[ ]") {
    return false;
  }
  const num = raw.match(NUMBER);
  if (num) {
    const n = Number(
      (raw.trim().startsWith("-") ? "-" : "") +
        num[1].replace(/[\s  ]/g, "") +
        (num[2] ? "." + num[2] : "")
    );
    return num[3] ? n / 100 : n;
  }
  return readDate(raw) ?? raw;
}

function readDate(raw: string): Date | null {
  let m = raw.match(DATE_FR);
  if (m) {
    const month = MONTHS_FR.indexOf(m[2].toLowerCase());
    if (month >= 0) {
      return new Date(
        Number(m[3]),
        month,
        Number(m[1]),
        Number(m[4] ?? 0),
        Number(m[5] ?? 0)
      );
    }
  }
  m = raw.match(DATE_EN);
  if (m) {
    const month = MONTHS_EN.indexOf(m[1].toLowerCase());
    if (month >= 0) {
      let hours = Number(m[4] ?? 0);
      if (m[6]?.toLowerCase() === "pm" && hours < 12) {
        hours += 12;
      }
      if (m[6]?.toLowerCase() === "am" && hours === 12) {
        hours = 0;
      }
      return new Date(
        Number(m[3]),
        month,
        Number(m[2]),
        hours,
        Number(m[5] ?? 0)
      );
    }
  }
  m = raw.match(DATE_NUMERIC);
  if (m) {
    return new Date(
      Number(m[3]),
      Number(m[2]) - 1,
      Number(m[1]),
      Number(m[4] ?? 0),
      Number(m[5] ?? 0)
    );
  }
  m = raw.match(DATE_ISO);
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4] ?? 0),
      Number(m[5] ?? 0)
    );
  }
  return null;
}

// ---- showing a result ------------------------------------------------------------------------------------------------

/**
 * The text a result is shown as in its cell.
 *
 * @param value the result of a formula.
 * @returns its text: numbers without float noise, dates in French, check boxes as ☑ / ☐.
 */
export function formatValue(value: Value): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "☑" : "☐";
  }
  if (typeof value === "number") {
    if (!isFinite(value)) {
      return "";
    }
    return String(Math.round(value * 1e10) / 1e10);
  }
  if (value instanceof Date) {
    return formatDate(
      value,
      value.getHours() || value.getMinutes()
        ? "D MMMM YYYY HH:mm"
        : "D MMMM YYYY"
    );
  }
  return String(value);
}

const pad = (n: number, size = 2) => String(n).padStart(size, "0");

/**
 * A date written with a Notion (moment.js) pattern: YYYY YY MMMM MMM MM M DD D dddd ddd HH H hh h mm A a.
 *
 * @param date the date.
 * @param pattern the pattern; text between [brackets] is written as it is.
 * @returns the date, in French.
 */
export function formatDate(date: Date, pattern: string): string {
  const tokens: Record<string, () => string> = {
    YYYY: () => String(date.getFullYear()),
    YY: () => pad(date.getFullYear() % 100),
    MMMM: () => MONTHS_FR[date.getMonth()],
    MMM: () => MONTHS_FR[date.getMonth()].slice(0, 4).replace(/\.$/, "") + ".",
    MM: () => pad(date.getMonth() + 1),
    M: () => String(date.getMonth() + 1),
    DD: () => pad(date.getDate()),
    Do: () => (date.getDate() === 1 ? "1er" : String(date.getDate())),
    D: () => String(date.getDate()),
    dddd: () => DAYS_FR[date.getDay()],
    ddd: () => DAYS_FR[date.getDay()].slice(0, 3) + ".",
    HH: () => pad(date.getHours()),
    H: () => String(date.getHours()),
    hh: () => pad(date.getHours() % 12 || 12),
    h: () => String(date.getHours() % 12 || 12),
    mm: () => pad(date.getMinutes()),
    A: () => (date.getHours() < 12 ? "AM" : "PM"),
    a: () => (date.getHours() < 12 ? "am" : "pm"),
  };
  return pattern.replace(
    /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|Do|D|dddd|ddd|HH|H|hh|h|mm|A|a/g,
    (match, literal) => (literal !== undefined ? literal : tokens[match]())
  );
}

// ---- the language ----------------------------------------------------------------------------------------------------

type Token =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "name"; value: string }
  | { kind: "op"; value: string };

const OPERATORS = [
  "==",
  "!=",
  ">=",
  "<=",
  "&&",
  "||",
  "+",
  "-",
  "*",
  "/",
  "%",
  "^",
  ">",
  "<",
  "!",
  "(",
  ")",
  ",",
  "?",
  ":",
  ".",
];

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const c = source[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/\d/.test(c) || (c === "." && /\d/.test(source[i + 1] ?? ""))) {
      const m = source.slice(i).match(/^\d*\.?\d+(?:e[-+]?\d+)?/i)!;
      tokens.push({ kind: "number", value: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "“" || c === "”" || c === "'") {
      const close = c === "“" ? "”" : c;
      let j = i + 1;
      let text = "";
      while (
        j < source.length &&
        source[j] !== close &&
        !(close === "”" && source[j] === '"')
      ) {
        if (source[j] === "\\" && j + 1 < source.length) {
          text += source[j + 1];
          j += 2;
          continue;
        }
        text += source[j++];
      }
      if (j >= source.length) {
        throw new FormulaError("Texte non terminé");
      }
      tokens.push({ kind: "string", value: text });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_À-ÿ]/.test(c)) {
      const m = source.slice(i).match(/^[A-Za-z_À-ÿ][A-Za-z_À-ÿ0-9]*/)!;
      tokens.push({ kind: "name", value: m[0] });
      i += m[0].length;
      continue;
    }
    const op = OPERATORS.find((o) => source.startsWith(o, i));
    if (!op) {
      throw new FormulaError(`Caractère inattendu : ${c}`);
    }
    tokens.push({ kind: "op", value: op });
    i += op.length;
  }
  return tokens;
}

type Expr =
  | { type: "literal"; value: Value }
  | { type: "call"; name: string; args: Expr[] }
  | { type: "unary"; op: string; arg: Expr }
  | { type: "binary"; op: string; left: Expr; right: Expr }
  | { type: "ternary"; cond: Expr; yes: Expr; no: Expr };

const BINARY: Record<string, [number, "left" | "right"]> = {
  "||": [1, "left"],
  or: [1, "left"],
  "&&": [2, "left"],
  and: [2, "left"],
  "==": [3, "left"],
  "!=": [3, "left"],
  ">": [4, "left"],
  ">=": [4, "left"],
  "<": [4, "left"],
  "<=": [4, "left"],
  "+": [5, "left"],
  "-": [5, "left"],
  "*": [6, "left"],
  "/": [6, "left"],
  "%": [6, "left"],
  "^": [8, "right"],
};

/**
 * Reads a formula.
 *
 * @param source the formula, e.g. `prop("Prix") * prop("Quantité")`.
 * @returns its syntax tree.
 * @throws FormulaError when it cannot be read.
 */
export function parseFormula(source: string): Expr {
  const tokens = tokenize(source);
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (value: string) => {
    const t = peek();
    return !!t && (t.kind === "op" || t.kind === "name") && t.value === value;
  };
  const expect = (value: string) => {
    if (!isOp(value)) {
      throw new FormulaError(`« ${value} » attendu`);
    }
    pos++;
  };

  const args = (): Expr[] => {
    expect("(");
    const out: Expr[] = [];
    if (!isOp(")")) {
      out.push(expression(0));
      while (isOp(",")) {
        pos++;
        out.push(expression(0));
      }
    }
    expect(")");
    return out;
  };

  const primary = (): Expr => {
    const t = peek();
    if (!t) {
      throw new FormulaError("Formule incomplète");
    }
    pos++;
    if (t.kind === "number" || t.kind === "string") {
      return { type: "literal", value: t.value };
    }
    if (t.kind === "op" && t.value === "(") {
      const inner = expression(0);
      expect(")");
      return inner;
    }
    if (t.kind === "op" && (t.value === "-" || t.value === "!")) {
      return { type: "unary", op: t.value, arg: expression(7) };
    }
    if (t.kind === "name") {
      if (t.value === "true" || t.value === "false") {
        return { type: "literal", value: t.value === "true" };
      }
      if (t.value === "not") {
        return { type: "unary", op: "!", arg: expression(7) };
      }
      if (isOp("(")) {
        return { type: "call", name: t.value, args: args() };
      }
      throw new FormulaError(
        `« ${t.value} » inconnu : prop("Nom de la colonne") pour lire une colonne`
      );
    }
    throw new FormulaError(`« ${t.value} » inattendu`);
  };

  const postfix = (): Expr => {
    let expr = primary();
    while (isOp(".")) {
      pos++;
      const name = peek();
      if (!name || name.kind !== "name") {
        throw new FormulaError("Nom de fonction attendu après « . »");
      }
      pos++;
      expr = { type: "call", name: name.value, args: [expr, ...args()] };
    }
    return expr;
  };

  function expression(minPrec: number): Expr {
    let left = postfix();
    for (;;) {
      const t = peek();
      if (!t) {
        break;
      }
      if (t.kind === "op" && t.value === "?" && minPrec === 0) {
        pos++;
        const yes = expression(0);
        expect(":");
        const other = expression(0);
        left = { type: "ternary", cond: left, yes, no: other };
        continue;
      }
      const spec = (t.kind === "op" || t.kind === "name") && BINARY[t.value];
      if (!spec || spec[0] < minPrec) {
        break;
      }
      pos++;
      const right = expression(spec[1] === "left" ? spec[0] + 1 : spec[0]);
      left = { type: "binary", op: t.value, left, right };
    }
    return left;
  }

  const tree = expression(0);
  if (pos < tokens.length) {
    throw new FormulaError(`« ${String(tokens[pos].value)} » en trop`);
  }
  return tree;
}

// ---- computing -------------------------------------------------------------------------------------------------------

const num = (v: Value): number => {
  if (v === null || v === "") {
    return 0;
  }
  if (typeof v === "boolean") {
    return v ? 1 : 0;
  }
  if (v instanceof Date) {
    return v.getTime();
  }
  if (typeof v === "number") {
    return v;
  }
  const read = readCell(v);
  if (typeof read === "number") {
    return read;
  }
  throw new FormulaError(`« ${v} » n'est pas un nombre`);
};
const text = (v: Value): string => (typeof v === "string" ? v : formatValue(v));
const truthy = (v: Value): boolean =>
  v !== null &&
  v !== false &&
  v !== 0 &&
  v !== "" &&
  !(typeof v === "number" && isNaN(v));
const date = (v: Value): Date => {
  if (v instanceof Date) {
    return v;
  }
  const read = typeof v === "string" ? readCell(v) : v;
  if (read instanceof Date) {
    return read;
  }
  throw new FormulaError(`« ${text(v)} » n'est pas une date`);
};
const same = (a: Value, b: Value): boolean => {
  if (a instanceof Date || b instanceof Date) {
    return a !== null && b !== null && date(a).getTime() === date(b).getTime();
  }
  if (typeof a === "number" || typeof b === "number") {
    return a !== null && b !== null && num(a) === num(b);
  }
  return (a ?? "") === (b ?? "");
};

const UNITS: Record<string, number> = {
  years: 0,
  quarters: 0,
  months: 0,
  weeks: 7 * 86400000,
  days: 86400000,
  hours: 3600000,
  minutes: 60000,
  seconds: 1000,
  milliseconds: 1,
};

function monthsBetween(a: Date, b: Date): number {
  let months =
    (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth());
  if (months > 0 && a.getDate() < b.getDate()) {
    months--;
  } else if (months < 0 && a.getDate() > b.getDate()) {
    months++;
  }
  return months;
}

function unitOf(v: Value): string {
  const unit = text(v).toLowerCase().replace(/s?$/, "s");
  if (!(unit in UNITS)) {
    throw new FormulaError(`Unité inconnue : ${text(v)}`);
  }
  return unit;
}

function addTo(d: Date, amount: number, unit: string): Date {
  const out = new Date(d.getTime());
  if (unit === "years" || unit === "quarters" || unit === "months") {
    out.setMonth(
      out.getMonth() +
        amount * (unit === "years" ? 12 : unit === "quarters" ? 3 : 1)
    );
    return out;
  }
  return new Date(d.getTime() + amount * UNITS[unit]);
}

type Fn = (args: Value[], now: () => Date) => Value;

const FUNCTIONS: Record<string, Fn> = {
  // arithmetic, as functions too (Notion's own names)
  add: ([a, b]) =>
    typeof a === "string" || typeof b === "string"
      ? text(a) + text(b)
      : num(a) + num(b),
  subtract: ([a, b]) => num(a) - num(b),
  multiply: ([a, b]) => num(a) * num(b),
  divide: ([a, b]) => {
    if (num(b) === 0) {
      throw new FormulaError("Division par zéro");
    }
    return num(a) / num(b);
  },
  mod: ([a, b]) => num(a) % num(b),
  pow: ([a, b]) => Math.pow(num(a), num(b)),
  unaryMinus: ([a]) => -num(a),
  unaryPlus: ([a]) => num(a),
  equal: ([a, b]) => same(a, b),
  unequal: ([a, b]) => !same(a, b),
  larger: ([a, b]) => num(a) > num(b),
  largerEq: ([a, b]) => num(a) >= num(b),
  smaller: ([a, b]) => num(a) < num(b),
  smallerEq: ([a, b]) => num(a) <= num(b),
  and: (xs) => xs.every(truthy),
  or: (xs) => xs.some(truthy),
  not: ([a]) => !truthy(a),
  // numbers
  toNumber: ([a]) =>
    a === null || a === ""
      ? null
      : num(typeof a === "string" ? readCell(a) : a),
  abs: ([a]) => Math.abs(num(a)),
  round: ([a, places]) => {
    const factor = Math.pow(
      10,
      places === undefined || places === null ? 0 : num(places)
    );
    return Math.round(num(a) * factor) / factor;
  },
  ceil: ([a]) => Math.ceil(num(a)),
  floor: ([a]) => Math.floor(num(a)),
  sqrt: ([a]) => Math.sqrt(num(a)),
  min: (xs) => Math.min(...xs.filter((x) => x !== null).map(num)),
  max: (xs) => Math.max(...xs.filter((x) => x !== null).map(num)),
  sum: (xs) => xs.reduce<number>((total, x) => total + num(x), 0),
  sign: ([a]) => Math.sign(num(a)),
  // text
  concat: (xs) => xs.map(text).join(""),
  join: ([separator, ...xs]) => xs.map(text).join(text(separator)),
  format: ([a]) => text(a),
  length: ([a]) => text(a).length,
  contains: ([a, b]) => text(a).includes(text(b)),
  lower: ([a]) => text(a).toLowerCase(),
  upper: ([a]) => text(a).toUpperCase(),
  trim: ([a]) => text(a).trim(),
  replace: ([a, b, c]) => text(a).replace(text(b), text(c)),
  replaceAll: ([a, b, c]) => text(a).split(text(b)).join(text(c)),
  slice: ([a, start, end]) =>
    text(a).slice(num(start), end === undefined ? undefined : num(end)),
  test: ([a, b]) => new RegExp(text(b)).test(text(a)),
  empty: ([a]) => a === null || a === "" || a === 0 || a === false,
  // conditions
  if: ([cond, a, b]) => (truthy(cond) ? a : (b ?? null)),
  ifs: (xs) => {
    for (let i = 0; i + 1 < xs.length; i += 2) {
      if (truthy(xs[i])) {
        return xs[i + 1];
      }
    }
    return xs.length % 2 ? xs[xs.length - 1] : null;
  },
  // dates
  now: (_xs, now) => now(),
  today: (_xs, now) => {
    const d = now();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  },
  formatDate: ([d, pattern]) =>
    d === null
      ? ""
      : formatDate(
          date(d),
          pattern === undefined ? "D MMMM YYYY" : text(pattern)
        ),
  dateBetween: ([a, b, unit]) => {
    if (a === null || b === null) {
      return null;
    }
    const u = unitOf(unit ?? "days");
    const [x, y] = [date(a), date(b)];
    if (u === "years") {
      return Math.trunc(monthsBetween(x, y) / 12);
    }
    if (u === "quarters") {
      return Math.trunc(monthsBetween(x, y) / 3);
    }
    if (u === "months") {
      return monthsBetween(x, y);
    }
    return Math.trunc((x.getTime() - y.getTime()) / UNITS[u]);
  },
  dateAdd: ([d, n, unit]) =>
    d === null ? null : addTo(date(d), num(n), unitOf(unit ?? "days")),
  dateSubtract: ([d, n, unit]) =>
    d === null ? null : addTo(date(d), -num(n), unitOf(unit ?? "days")),
  year: ([d]) => (d === null ? null : date(d).getFullYear()),
  month: ([d]) => (d === null ? null : date(d).getMonth() + 1),
  date: ([d]) => (d === null ? null : date(d).getDate()),
  day: ([d]) => (d === null ? null : date(d).getDay()),
  week: ([d]) => {
    if (d === null) {
      return null;
    }
    const x = date(d);
    const target = new Date(
      Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())
    );
    const dayNr = (target.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNr + 3);
    const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
    return (
      1 +
      Math.round(
        ((target.getTime() - firstThursday.getTime()) / 86400000 -
          3 +
          ((firstThursday.getUTCDay() + 6) % 7)) /
          7
      )
    );
  },
  hour: ([d]) => (d === null ? null : date(d).getHours()),
  minute: ([d]) => (d === null ? null : date(d).getMinutes()),
  timestamp: ([d]) => (d === null ? null : date(d).getTime()),
  fromTimestamp: ([n]) => new Date(num(n)),
};

const OPS: Record<string, string> = {
  "+": "add",
  "-": "subtract",
  "*": "multiply",
  "/": "divide",
  "%": "mod",
  "^": "pow",
  "==": "equal",
  "!=": "unequal",
  ">": "larger",
  ">=": "largerEq",
  "<": "smaller",
  "<=": "smallerEq",
};

/** What a formula can read: the cell of the same row in another column, by the column's name. */
export type Row = (column: string) => Value;

/**
 * Computes a formula for one row.
 *
 * @param formula the formula, or its syntax tree from parseFormula.
 * @param row reads the value of another column of the same row.
 * @param now the current date (tests pass a fixed one).
 * @returns the result.
 * @throws FormulaError when it cannot be computed.
 */
export function evaluate(
  formula: string | Expr,
  row: Row,
  now: () => Date = () => new Date()
): Value {
  const tree = typeof formula === "string" ? parseFormula(formula) : formula;
  let steps = 0;

  const run = (expr: Expr): Value => {
    if (++steps > 10000) {
      throw new FormulaError("Formule trop longue à calculer");
    }
    switch (expr.type) {
      case "literal":
        return expr.value;
      case "ternary":
        return truthy(run(expr.cond)) ? run(expr.yes) : run(expr.no);
      case "unary":
        return expr.op === "-" ? -num(run(expr.arg)) : !truthy(run(expr.arg));
      case "binary": {
        if (expr.op === "&&" || expr.op === "and") {
          return truthy(run(expr.left)) && truthy(run(expr.right));
        }
        if (expr.op === "||" || expr.op === "or") {
          return truthy(run(expr.left)) || truthy(run(expr.right));
        }
        return FUNCTIONS[OPS[expr.op]]([run(expr.left), run(expr.right)], now);
      }
      case "call": {
        if (expr.name === "prop") {
          if (expr.args.length !== 1) {
            throw new FormulaError('prop("Nom de la colonne") attend un nom');
          }
          return row(text(run(expr.args[0])));
        }
        if (expr.name === "if") {
          // only the branch that is taken is computed, like Notion
          const [cond, a, b] = expr.args;
          return truthy(run(cond)) ? run(a) : b ? run(b) : null;
        }
        const fn = FUNCTIONS[expr.name];
        if (!fn) {
          throw new FormulaError(`Fonction inconnue : ${expr.name}`);
        }
        return fn(expr.args.map(run), now);
      }
    }
    throw new FormulaError("Formule illisible");
  };

  return run(tree);
}

/**
 * Computes a formula for a row of a table and returns the text of its cell: the result, or the error.
 *
 * @param formula the formula.
 * @param cells the texts of the row's cells, by column name.
 * @param now the current date.
 * @returns the text to show in the cell.
 */
export function computeCell(
  formula: string,
  cells: Record<string, string>,
  now: () => Date = () => new Date()
): string {
  try {
    return formatValue(
      evaluate(
        formula,
        (column) => {
          if (!(column in cells)) {
            throw new FormulaError(`Colonne inconnue : ${column}`);
          }
          return readCell(cells[column]);
        },
        now
      )
    );
  } catch (err) {
    return (
      "⚠ " + (err instanceof FormulaError ? err.message : "Formule invalide")
    );
  }
}
