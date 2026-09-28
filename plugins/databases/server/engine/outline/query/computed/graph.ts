/** Nodes in the order they can be computed, and those caught in a cycle. */
export interface DependencyOrder<T> {
  /** Every node after the nodes it depends on (cyclic nodes included, in any order). */
  order: T[];
  /** Nodes that depend on themselves, directly or through others. */
  cyclic: Set<T>;
}

/**
 * Orders nodes so that each comes after its dependencies, finding the cycles
 * on the way (strongly connected components, Tarjan's algorithm).
 *
 * @param nodes the nodes.
 * @param dependencies the nodes a node depends on; others than `nodes` are ignored.
 * @returns the order and the cyclic nodes.
 */
export function orderByDependencies<T>(
  nodes: T[],
  dependencies: (node: T) => T[]
): DependencyOrder<T> {
  const known = new Set(nodes);
  const index = new Map<T, number>();
  const lowLink = new Map<T, number>();
  const stack: T[] = [];
  const onStack = new Set<T>();
  const order: T[] = [];
  const cyclic = new Set<T>();
  let counter = 0;

  const visit = (node: T) => {
    index.set(node, counter);
    lowLink.set(node, counter);
    counter++;
    stack.push(node);
    onStack.add(node);

    const edges = dependencies(node).filter((dependency) =>
      known.has(dependency)
    );
    for (const dependency of edges) {
      if (!index.has(dependency)) {
        visit(dependency);
        lowLink.set(
          node,
          Math.min(lowLink.get(node) ?? 0, lowLink.get(dependency) ?? 0)
        );
      } else if (onStack.has(dependency)) {
        lowLink.set(
          node,
          Math.min(lowLink.get(node) ?? 0, index.get(dependency) ?? 0)
        );
      }
    }

    if (lowLink.get(node) !== index.get(node)) {
      return;
    }
    const component: T[] = [];
    let member: T | undefined;
    do {
      member = stack.pop();
      if (member === undefined) {
        break;
      }
      onStack.delete(member);
      component.push(member);
    } while (member !== node);

    if (component.length > 1 || edges.includes(node)) {
      component.forEach((item) => cyclic.add(item));
    }
    order.push(...component);
  };

  for (const node of nodes) {
    if (!index.has(node)) {
      visit(node);
    }
  }
  return { order, cyclic };
}
