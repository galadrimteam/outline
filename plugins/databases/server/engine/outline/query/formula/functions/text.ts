import { node, numberOf, textOf } from "../arguments";
import type { Compiled, FormulaFunction } from "../compiled";
import { FormulaRuntimeError, NUMBER, TEXT, toText } from "../values";

/** Text: CONCATENATE, FIND, SEARCH, MID, LEFT, RIGHT, REPLACE, REGEXP_REPLACE, SUBSTITUTE, LOWER, UPPER, REPT, TRIM, LEN, T. */
export const textFunctions: Record<string, FormulaFunction> = {
  CONCATENATE: {
    minArgs: 1,
    compile: (args) => {
      const texts = args.map(textOf);
      return node(TEXT, (scope) =>
        texts.map((text) => text(scope) ?? "").join("")
      );
    },
  },
  FIND: {
    minArgs: 2,
    maxArgs: 3,
    compile: ([needle, haystack, start]) =>
      position(needle, haystack, start, false),
  },
  SEARCH: {
    minArgs: 2,
    maxArgs: 3,
    compile: ([needle, haystack, start]) =>
      position(needle, haystack, start, true),
  },
  MID: {
    minArgs: 3,
    maxArgs: 3,
    compile: ([text, start, count]) => {
      const t = textOf(text);
      const s = numberOf(start);
      const c = numberOf(count);
      return node(TEXT, (scope) => {
        const value = t(scope);
        if (value === null) {
          return null;
        }
        const from = Math.trunc(s(scope) ?? 1) - 1;
        const to = from + Math.trunc(c(scope) ?? value.length);
        return value.slice(Math.max(0, from), Math.max(0, to));
      });
    },
  },
  LEFT: {
    minArgs: 1,
    maxArgs: 2,
    compile: ([text, count]) => {
      const t = textOf(text);
      const c = count ? numberOf(count) : () => 1;
      return node(TEXT, (scope) => {
        const value = t(scope);
        return value === null
          ? null
          : value.slice(0, Math.max(0, Math.trunc(c(scope) ?? 1)));
      });
    },
  },
  RIGHT: {
    minArgs: 1,
    maxArgs: 2,
    compile: ([text, count]) => {
      const t = textOf(text);
      const c = count ? numberOf(count) : () => 1;
      return node(TEXT, (scope) => {
        const value = t(scope);
        if (value === null) {
          return null;
        }
        const length = Math.max(0, Math.trunc(c(scope) ?? 1));
        return length ? value.slice(-length) : "";
      });
    },
  },
  REPLACE: {
    minArgs: 4,
    maxArgs: 4,
    compile: ([text, start, count, replacement]) => {
      const t = textOf(text);
      const s = numberOf(start);
      const c = numberOf(count);
      const r = textOf(replacement);
      return node(TEXT, (scope) => {
        const value = t(scope);
        if (value === null) {
          return null;
        }
        const from = Math.max(0, Math.trunc(s(scope) ?? 1) - 1);
        const length = Math.max(0, Math.trunc(c(scope) ?? 0));
        return (
          value.slice(0, from) + (r(scope) ?? "") + value.slice(from + length)
        );
      });
    },
  },
  REGEXP_REPLACE: {
    minArgs: 3,
    maxArgs: 3,
    compile: ([text, pattern, replacement]) => {
      const t = textOf(text);
      const p = textOf(pattern);
      const r = textOf(replacement);
      return node(TEXT, (scope) => {
        const value = t(scope);
        if (value === null) {
          return null;
        }
        let regex: RegExp;
        try {
          regex = new RegExp(p(scope) ?? "", "g");
        } catch (_err) {
          throw new FormulaRuntimeError("Invalid regular expression");
        }
        return value.replace(regex, jsReplacement(r(scope) ?? ""));
      });
    },
  },
  SUBSTITUTE: {
    minArgs: 3,
    maxArgs: 4,
    compile: ([text, search, replacement, instance]) => {
      const t = textOf(text);
      const s = textOf(search);
      const r = textOf(replacement);
      const i = instance ? numberOf(instance) : () => null;
      return node(TEXT, (scope) => {
        const value = t(scope);
        const old = s(scope) ?? "";
        if (value === null || old === "") {
          return value;
        }
        const pieces = value.split(old);
        const nth = i(scope);
        if (nth === null) {
          return pieces.join(r(scope) ?? "");
        }
        const index = Math.trunc(nth);
        if (index < 1 || index >= pieces.length) {
          return value;
        }
        return (
          pieces.slice(0, index).join(old) +
          (r(scope) ?? "") +
          pieces.slice(index).join(old)
        );
      });
    },
  },
  LOWER: mapText((value) => value.toLowerCase()),
  UPPER: mapText((value) => value.toUpperCase()),
  TRIM: mapText((value) => value.trim()),
  ENCODE_URL_COMPONENT: mapText(encodeURIComponent),
  REPT: {
    minArgs: 2,
    maxArgs: 2,
    compile: ([text, times]) => {
      const t = textOf(text);
      const n = numberOf(times);
      return node(TEXT, (scope) => {
        const value = t(scope);
        return value === null
          ? null
          : value.repeat(Math.max(0, Math.trunc(n(scope) ?? 0)));
      });
    },
  },
  LEN: {
    minArgs: 1,
    maxArgs: 1,
    compile: ([text]) => {
      const t = textOf(text);
      return node(NUMBER, (scope) => {
        const value = t(scope);
        return value === null ? null : value.length;
      });
    },
  },
  T: {
    minArgs: 1,
    maxArgs: 1,
    compile: ([value]) => {
      if (value.type.type !== "string") {
        return node(TEXT, () => null);
      }
      const t = textOf(value);
      return node(TEXT, t);
    },
  },
  TEXT_ALL: {
    minArgs: 1,
    maxArgs: 1,
    compile: ([value]) => {
      const type = {
        type: "string" as const,
        isMultiple: value.type.isMultiple,
      };
      return node(type, (scope) => {
        const result = value.run(scope);
        if (Array.isArray(result)) {
          return result.map((item) =>
            toText(item, value.type.type, value.field)
          );
        }
        return toText(result, value.type.type, value.field);
      });
    },
  },
};

function mapText(operation: (value: string) => string): FormulaFunction {
  return {
    minArgs: 1,
    maxArgs: 1,
    compile: ([text]) => {
      const t = textOf(text);
      return node(TEXT, (scope) => {
        const value = t(scope);
        return value === null ? null : operation(value);
      });
    },
  };
}

function position(
  needle: Compiled,
  haystack: Compiled,
  start: Compiled | undefined,
  ignoreCase: boolean
): Compiled {
  const n = textOf(needle);
  const h = textOf(haystack);
  const s = start ? numberOf(start) : () => 1;
  return node(NUMBER, (scope) => {
    const find = n(scope);
    const within = h(scope);
    if (find === null || within === null) {
      return null;
    }
    const from = Math.max(0, Math.trunc(s(scope) ?? 1) - 1);
    const found = ignoreCase
      ? within.toLowerCase().indexOf(find.toLowerCase(), from)
      : within.indexOf(find, from);
    if (found < 0) {
      return ignoreCase ? null : 0;
    }
    return found + 1;
  });
}

// PostgreSQL writes groups \1 and the whole match \&; JavaScript writes $1 and $&.
function jsReplacement(replacement: string): string {
  return replacement
    .replace(/\$/g, "$$$$")
    .replace(/\\(\d)/g, "$$$1")
    .replace(/\\&/g, "$$&");
}
