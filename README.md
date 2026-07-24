# @calctree/dagraph
A directed acyclic graph (DAG) implementation in TypeScript.

> **This is a modified fork of [`@sha1n/dagraph`](https://github.com/sha1n/dagraph)
> by Shai Nagar**, used under the MIT License (see [`LICENSE`](./LICENSE)).
> Upstream runs a full cycle check on **every** `addEdge`, making graph
> construction `O(E·(V+E))`. This fork defers cycle detection to a single
> `assertAcyclic()` call after construction — `O(V+E)` — while preserving the
> original's observable ordering (topological-sort tie-breaks and reversed-graph
> order included) and cycle-attribution message. The `traverse`/visitor API is
> kept verbatim from upstream.

- [@calctree/dagraph](#calctreedagraph)
  - [Features](#features)
  - [Differences from `@sha1n/dagraph`](#differences-from-sha1ndagraph)
  - [Usage](#usage)
    - [Basic](#basic)
    - [Custom Objects](#custom-objects)
    - [Visualization](#visualization)
    - [Custom Traversal](#custom-traversal)
  - [Install](#install)
  - [Development](#development)

## Features
- **Generic Graph Structure**: Store any identifiable data in the graph.
- **Topological Sort**: Iterate over nodes in topological order (dependencies first).
- **Deferred Cycle Detection**: `O(V+E)` — call `assertAcyclic()` once after construction.
- **Root Traversal**: Efficiently access all root nodes (nodes with no dependencies).
- **Graph Reversal**: Create a new graph with all edges reversed.
- **Depth-First Traversal**: Visit nodes with context, parent, depth, and index information.
- **TypeScript**: Written in TypeScript with full type definitions.

## Differences from `@sha1n/dagraph`
- **`addEdge` no longer throws on a cycle.** Cycle detection is deferred: call
  `assertAcyclic()` once after construction. It throws the same
  `"[a] -> [b] form a cycle"` message, attributed (via binary search over the
  edge log) to the same edge upstream's per-edge check would have flagged.
- `reverse()` node-insertion order is pinned to 0.1.0's, so reversed-graph
  topological order (sibling tie-breaks included) is unchanged.

## Usage

### Basic 

```ts
import createDAG from '@calctree/dagraph';

const dag = createDAG();

dag.addNode({id : 'a'});
dag.addEdge({id : 'b'}, {id : 'a'}); // b -> a
dag.addEdge({id : 'c'}, {id : 'a'}); // c -> a
dag.addEdge({id : 'd'}, {id : 'b'}); // d -> b

// Topological sort
for (const node of dag.topologicalSort()) {
  console.log(node.id);
}
```

### Custom Objects
Any object implementing the `Identifiable` interface (having an `id: string` property) can be stored.

```ts
import { createDAG, Identifiable } from '@calctree/dagraph';

type MyThing = {
  id: string; 
  name: string;
  doSomething(): void;
};

const myThing: MyThing = {
    id: 'a',
    name: 'my thing',
    doSomething: () => {
      console.log('A');
    }
  };

const myOtherThing: MyThing = {
    id: 'b',
    name: 'my other thing',
    doSomething: () => {
      console.log('B');
    }
  };

const myDAG = createDAG<MyThing>();

// Add nodes explicitly or implicitly via addEdge
myDAG.addEdge(myThing, myOtherThing); // myThing -> myOtherThing
```

### Visualization

You can visualize the graph structure using built-in formatters with the `traverse` method.

#### Indented List
```ts
import createDAG, { createIndentFormatter } from '@calctree/dagraph';

const dag = createDAG();
// ... add nodes and edges ...

const lines: string[] = [];
dag.traverse(createIndentFormatter(), lines);
console.log(lines.join('\n'));

// Output example:
// A
//   B
//     C
```

#### Tree Structure
```ts
import createDAG, { createTreeAsciiFormatter } from '@calctree/dagraph';

const dag = createDAG();
// ... add nodes and edges ...

const lines: string[] = [];
dag.traverse(createTreeAsciiFormatter(), lines);
console.log(lines.join('\n'));

// Output example:
// A
// ├── B
// │   └── C
// └── D
//     └── E
```

### Custom Traversal

The `traverse` method allows you to visit every node in a depth-first manner, effectively expanding the graph into a tree (nodes with multiple parents are visited for each path).

```ts
import createDAG, { DAGVisitor } from '@calctree/dagraph';

// ... setup dag ...

const visitor: DAGVisitor<MyType, void> = (node, state, context) => {
  console.log(`Node: ${node.id}, Depth: ${state.depth}, Parent: ${state.parent?.id}`);
};

dag.traverse(visitor);
```

## Install

Published to the **GitHub Packages** registry. Consumers need an `.npmrc`
mapping the scope:

```
@calctree:registry=https://npm.pkg.github.com
```

Then:
```bash
pnpm add @calctree/dagraph
# or: npm i @calctree/dagraph
```

## Development

This project uses [pnpm](https://pnpm.io/) for dependency management.

### Prerequisites
- Node.js (version specified in `.nvmrc` or `engines` in `package.json`)
- pnpm

### Commands

- **Install dependencies**:
  ```bash
  pnpm install
  ```

- **Build**:
  ```bash
  pnpm build
  ```

- **Run Tests**:
  ```bash
  pnpm test
  ```

- **Lint**:
  ```bash
  pnpm lint
  ```