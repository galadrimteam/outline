import { listOf, node, textOf } from "../arguments";
import type { Compiled, FormulaFunction, FormulaScope } from "../compiled";
import type { Scalar, ValueType } from "../values";
import { NUMBER, TEXT, convertScalar, toText } from "../values";

/** Lists: COUNTALL, COUNTA, COUNT, ARRAY_JOIN, ARRAY_UNIQUE, ARRAY_FLATTEN, ARRAY_COMPACT. */
export const arrayFunctions: Record<string, FormulaFunction> = {
  COUNTALL: {
    minArgs: 1,
    maxArgs: 1,
    compile: ([value]) =>
      node(NUMBER, (scope) => {
        const result = value.run(scope);
        if (result === null) {
          return 0;
        }
        return Array.isArray(result) ? result.length : 1;
      }),
  },
  COUNTA: {
    minArgs: 1,
    compile: (args) => {
      const lists = args.map(listOf);
      return node(NUMBER, (scope) =>
        lists.reduce(
          (count, list) =>
            count +
            list(scope).filter(
              (item) => item !== null && item !== "" && item !== false
            ).length,
          0
        )
      );
    },
  },
  COUNT: {
    minArgs: 1,
    compile: (args) => {
      const lists = args
        .filter((arg) => arg.type.type === "number")
        .map(listOf);
      return node(NUMBER, (scope) =>
        lists.reduce(
          (count, list) =>
            count +
            list(scope).filter((item) => typeof item === "number").length,
          0
        )
      );
    },
  },
  ARRAY_JOIN: {
    minArgs: 1,
    maxArgs: 2,
    compile: ([list, separator]) => {
      const items = listOf(list);
      const by = separator ? textOf(separator) : () => null;
      return node(TEXT, (scope) => {
        const texts = items(scope)
          .map((item) => toText(item, list.type.type, list.field))
          .filter((item): item is string => item !== null && item !== "");
        return texts.length ? texts.join(by(scope) ?? ", ") : null;
      });
    },
  },
  ARRAY_UNIQUE: listFunction((items) => {
    const seen = new Set<Scalar>();
    return items.filter((item) => {
      if (item === null || seen.has(item)) {
        return false;
      }
      seen.add(item);
      return true;
    });
  }),
  ARRAY_FLATTEN: listFunction((items) => items.filter((item) => item !== null)),
  ARRAY_COMPACT: listFunction((items) =>
    items.filter((item) => item !== null && item !== "")
  ),
};

function listFunction(
  transform: (items: Scalar[]) => Scalar[]
): FormulaFunction {
  return {
    minArgs: 1,
    compile: (args) => {
      const type = unionType(args);
      const lists = args.map((arg) => ({ arg, list: listOf(arg) }));
      const read = (scope: FormulaScope) =>
        lists.flatMap(({ arg, list }) =>
          list(scope).map((item) =>
            convertScalar(
              item,
              arg.type.type,
              type.type,
              scope.timeZone,
              arg.field
            )
          )
        );
      return node(type, (scope) => {
        const items = transform(read(scope));
        return items.length ? items : null;
      });
    },
  };
}

function unionType(args: Compiled[]): ValueType {
  const [first] = args;
  const same = args.every((arg) => arg.type.type === first.type.type);
  return { type: same ? first.type.type : "string", isMultiple: true };
}
