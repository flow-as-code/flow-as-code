# Auto-layout fixtures

The deterministic layout every implementation assigns to an action that has no
hand-placed position. It is part of the cross-language contract because a
`.flow.tf` omits a `position` block exactly when the action sits where
auto-layout would put it, so a second implementation has to compute the same
coordinates or it cannot tell an omitted position from a moved one. The
algorithm is owned by this repository rather than borrowed from a layout
library for that reason: it is small enough to specify, and specified here.

```
<case>/doc.flowdoc.json       a FlowDoc; its own layout, if any, is ignored
<case>/expected.layout.json   what autoLayout(doc.content.Actions) returns, byte-exact
```

## The algorithm

Input: the `Actions` array of a flow, in document order, and `StartAction`.
Output: a top-left `{x, y}` per action, integers, in a left-to-right layered
arrangement. Node boxes are 180 by 60; ranks are 80 apart and nodes within a
rank 40 apart; the first node sits at (20, 20).

1. **Edges.** Every action has, in order, the targets of its `NextAction`,
   then of each `Errors[]` entry, then of each `Conditions[]` entry, keeping
   only targets that name an action in the array and dropping a repeat of a
   target already listed for the same action.
2. **Discovery.** A depth-first walk starts at `StartAction` and follows each
   action's edges in that order. The walk records the order in which actions
   are first reached (the discovery index) and drops every edge that points at
   an action still on the walk's stack (a back edge, the way a `Loop` returns
   to an earlier action). Every other edge is kept. If `StartAction` names no
   action, nothing is reachable.
3. **Ranks.** The reachable actions, taken in reverse post-order of the walk
   (a topological order once back edges are gone), each push their kept edge
   targets one rank further right: `StartAction` has rank 0 and every other
   reachable action's rank is the longest kept path from `StartAction` to it.
4. **Unreachable actions** all take the rank after the deepest reachable one
   (rank 0 when nothing is reachable), in document order.
5. **Order within a rank** is discovery order, with unreachable actions after
   every reachable one in document order.
6. **Coordinates.** `x = 20 + rank * (180 + 80)` and `y = 20 + index * (60 + 40)`,
   where `index` is the action's position within its rank, counting from 0.

Two actions never share a position, and the same array always gives the same
answer. Document order is an input by design: the same graph declared in a
different order may lay out differently, which is what ADR-0003 says about
order everywhere else.

## Cases

| case         | what it pins                                                     |
| ------------ | ---------------------------------------------------------------- |
| single       | one terminal action sits at the origin                           |
| linear       | a chain advances one rank per action                             |
| branching    | condition and error targets share a rank in discovery order      |
| longest-path | a node reached by a short and a long path takes the long one     |
| cycle        | a back edge is dropped rather than pushing ranks forever         |
| unreachable  | orphans sit past the deepest rank, in document order             |
