/**
 * CalcTree fork of @sha1n/dagraph (https://github.com/sha1n/dagraph),
 * originally by Shai Nagar, used under the MIT License (see LICENSE).
 *
 * The upstream `addEdge` runs a full Kahn's-algorithm `isAcyclic()` sweep over
 * the whole graph on EVERY edge insertion, making graph construction
 * O(E·(V+E)). This fork inserts edges unchecked and runs the cycle check once,
 * via `assertAcyclic()`, after the graph is built — O(V+E) — while preserving
 * every observable of the pre-0.2.0 (0.1.0) behavior:
 *   - `topologicalSort()` ordering, INCLUDING tie-breaks between independent
 *     siblings (load-bearing for CalcTree: duplicate named values resolve
 *     last-write-wins in this order).
 *   - `reverse()` node-insertion order is pinned to 0.1.0's interleaved
 *     construction, NOT the upstream 0.2.0 refactor (PR sha1n/dagraph#60),
 *     which reorders siblings and would change reversed-graph sort order.
 *   - On a cyclic graph, `assertAcyclic()` throws the same
 *     `"[a] -> [b] form a cycle"` message, attributed (via binary search over
 *     the edge log, in O(log E) checks) to the same edge the per-edge check
 *     would have flagged.
 *
 * The `traverse`/visitor API and `lib/formatVisitors` are kept verbatim from
 * upstream.
 */
interface Identifiable {
  readonly id: string;
}

/**
 * The structural surface of a graph produced by {@link createDAG}.
 *
 * `assertAcyclic` is REQUIRED, not optional: the recursive `topologicalSort`
 * marks nodes visited AFTER recursing, so a cycle that reaches it recurses
 * unboundedly (stack overflow) rather than throwing. Callers must be able to
 * validate acyclicity explicitly after construction.
 */
interface CalcDag<T extends Identifiable> {
  addNode(data: T): unknown;
  getNode(id: string): T | undefined;
  addEdge(from: T, to: T): unknown;
  topologicalSort(): Iterable<T>;
  roots(): Iterable<T>;
  nodes(): Iterable<T>;
  reverse(): CalcDag<T>;
  /** Throws `Error("[a] -> [b] form a cycle")` if the graph is cyclic. */
  assertAcyclic(): void;
}

/**
 * Represents the state of the traversal at the current node.
 */
interface TraversalState<T> {
  /** The parent node from which the current node was reached. Null for root nodes. */
  readonly parent: T | null;
  /** The depth of the current node in the traversal (0 for roots). */
  readonly depth: number;
  /** The index of the current node among its siblings (children of the same parent). */
  readonly index: number;
  /** The total number of siblings (children of the same parent). */
  readonly total: number;
}

/**
 * A visitor function called for each node during traversal.
 *
 * @param node The current node data.
 * @param state The state of the traversal at the current node.
 * @param context The context object passed to traverse.
 */
type DAGVisitor<T, C> = (node: T, state: TraversalState<T>, context: C) => void;

class Node<T extends Identifiable> {
  constructor(
    readonly data: T,
    readonly dependencies = new Set<string>()
  ) {}

  get id(): string {
    return this.data.id;
  }
}

class DAGraph<T extends Identifiable> implements CalcDag<T> {
  private readonly nodesById = new Map<string, Node<T>>();
  // Edge endpoints (from-id, to-id) in insertion order — consumed only by
  // assertAcyclic's error path to attribute a cycle to the same edge the
  // per-edge check would have flagged. Ids only, NOT the full `T` node
  // objects: acyclicity of a prefix depends solely on ids, and retaining full
  // node payloads here would keep them alive for an error-only path.
  private readonly edgeLog: Array<readonly [string, string]> = [];

  /**
   * Adds the specified identifiable node to the graph.
   */
  addNode(data: T): DAGraph<T> {
    this.ensureNode(data);

    return this;
  }

  /**
   * @returns the data node identified by the specified id if found, else returns undefined.
   */
  getNode(id: string): T | undefined {
    return this.nodesById.get(id)?.data;
  }

  /**
   * Adds an edge pointing from 'from' to 'to'.
   *
   * Unlike upstream this does NOT check for cycles — call {@link assertAcyclic}
   * once after construction.
   */
  addEdge(from: T, to: T): DAGraph<T> {
    const fromNode = this.ensureNode(from);
    const toNode = this.ensureNode(to);

    toNode.dependencies.add(fromNode.id);
    this.edgeLog.push([fromNode.id, toNode.id]);

    return this;
  }

  /**
   * Throws `Error("[a] -> [b] form a cycle")` — same message, same edge
   * attribution as the upstream per-edge check — if the graph is cyclic.
   *
   * Upstream flagged the FIRST edge (in insertion order) whose addition closed
   * a cycle. Cyclicity is monotone in prefix length (edges are only added,
   * never removed), so that edge is the boundary of the smallest cyclic prefix
   * — found by binary search in O(log E) cycle checks rather than a linear
   * replay.
   */
  assertAcyclic(): void {
    if (this.isAcyclic()) return;
    // Whole graph is cyclic, so some prefix boundary closed the first cycle.
    // Invariant across the search: prefix of length `hi` is cyclic, prefix of
    // length `lo - 1` is acyclic.
    const log = this.edgeLog;
    let lo = 1;
    let hi = log.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (DAGraph.prefixHasCycle(log, mid)) hi = mid;
      else lo = mid + 1;
    }
    const [from, to] = log[lo - 1];
    throw new Error(`[${from}] -> [${to}] form a cycle`);
  }

  /**
   * Whether the sub-graph formed by the first `count` logged edges (insertion
   * order) contains a cycle. Rebuilt from ids alone via the same addEdge /
   * isAcyclic path the real graph uses.
   */
  private static prefixHasCycle(log: ReadonlyArray<readonly [string, string]>, count: number): boolean {
    const g = new DAGraph<Identifiable>();
    for (let i = 0; i < count; i++) {
      g.addEdge({ id: log[i][0] }, { id: log[i][1] });
    }
    return !g.isAcyclic();
  }

  /**
   * Returns a generator that returns all the nodes in topological order.
   * Implements a depth-first-search algorithm.
   */
  *topologicalSort(): Iterable<T> {
    const nodesById = this.nodesById;

    const visited = new Set<string>();
    const dependenciesOf = function* (node: Node<T>): Iterable<T> {
      for (const child of node.dependencies || []) {
        if (!visited.has(child)) {
          yield* dependenciesOf(nodesById.get(child)!);
          yield nodesById.get(child)!.data;
          visited.add(child);
        }
      }
    };

    for (const node of nodesById.values()) {
      if (!visited.has(node.id)) {
        yield* dependenciesOf(node);
        yield node.data;
        visited.add(node.id);
      }
    }
  }

  /**
   * A generator that returns the traverse roots of this graph.
   */
  *roots(): Iterable<T> {
    for (const node of this.nodesById.values()) {
      if (node.dependencies.size === 0) {
        yield node.data;
      }
    }
  }

  /**
   * A generator that returns all the nodes in the this graph.
   */
  *nodes(): Iterable<T> {
    for (const node of this.nodesById.values()) {
      yield node.data;
    }
  }

  /**
   * Returns a graph with the same edges pointing in the opposite direction.
   *
   * @returns a DAGraph
   */
  reverse(): DAGraph<T> {
    // Pinned to 0.1.0's interleaved construction (addNode + addEdge per
    // dependency), NOT the 0.2.0 refactor (sha1n/dagraph#60) that adds all
    // nodes first. The two produce the same reversed edge set but different
    // node-insertion order, which changes topological-sort tie-breaks — a
    // load-bearing observable for CalcTree.
    const reverseGraph = new DAGraph<T>();

    for (const node of this.nodesById.values()) {
      reverseGraph.addNode(node.data);
      for (const dependency of node.dependencies) {
        const depData = this.nodesById.get(dependency)!.data;
        reverseGraph.addNode(depData);
        reverseGraph.addEdge(node.data, depData);
      }
    }

    return reverseGraph;
  }

  /**
   * Traverses the graph in depth-first order and calls the visitor function for each node.
   * Siblings (nodes sharing the same parent) are visited in the order they were added`.
   *
   * Note: This traversal behaves like a tree expansion. If a node is reachable via multiple paths
   * (e.g., a "diamond" structure), it will be visited multiple times—once for each path reaching it.
   *
   *
   *
   * @param visitor the visitor function to call for each node.
   * @param context the context object to pass to the visitor.
   */
  traverse<C>(visitor: DAGVisitor<T, C>, context: C): void {
    const outgoing = new Map<string, string[]>();
    for (const node of this.nodesById.values()) {
      for (const depId of node.dependencies) {
        let children = outgoing.get(depId);
        if (!children) {
          children = [];
          outgoing.set(depId, children);
        }
        children.push(node.id);
      }
    }

    const visitNode = (nodeId: string, parent: T | null, depth: number, index: number, total: number) => {
      const node = this.nodesById.get(nodeId);
      if (!node) {
        return;
      }

      visitor(node.data, { parent, depth, index, total }, context);

      const children = outgoing.get(nodeId) || [];
      children.forEach((childId, i) => {
        visitNode(childId, node.data, depth + 1, i, children.length);
      });
    };

    const roots = [...this.roots()];
    roots.forEach((root, i) => {
      visitNode(root.id, null, 0, i, roots.length);
    });
  }

  private ensureNode(data: T): Node<T> {
    let node = this.nodesById.get(data.id);
    if (node) {
      return node;
    }

    node = new Node(data);
    this.nodesById.set(data.id, node);
    return node;
  }

  private isAcyclic(): boolean {
    const degrees = new Map<string, number>();
    this.nodesById.forEach(node => degrees.set(node.id, 0));
    this.nodesById.forEach(node =>
      node.dependencies.forEach(child => {
        degrees.set(child, degrees.get(child)! + 1);
      })
    );

    const queue = new Array<string>();
    this.nodesById.forEach(node => {
      if (degrees.get(node.id) === 0) {
        queue.push(node.id);
      }
    });

    let visitedNodeCount = 0;
    // Head index instead of the O(n) `queue.splice(0, 1)`; the boolean outcome
    // is unaffected by dequeue order.
    let head = 0;

    while (head < queue.length) {
      const nodeId = queue[head];
      head += 1;
      visitedNodeCount += 1;

      this.nodesById.get(nodeId)!.dependencies.forEach(child => {
        degrees.set(child, degrees.get(child)! - 1);
        if (degrees.get(child) === 0) {
          queue.push(child);
        }
      });
    }

    return visitedNodeCount === this.nodesById.size;
  }
}

function createDAG<T extends Identifiable>(): DAGraph<T> {
  return new DAGraph<T>();
}

export * from './lib/formatVisitors';
export type { DAGraph, CalcDag, Identifiable, DAGVisitor, TraversalState };
export default createDAG;
export { createDAG };
