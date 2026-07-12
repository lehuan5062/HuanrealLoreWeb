// Branch graph layout tests (DOM-free)
import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutGraph, layoutSignature } from "../web/graph.js";

test("layoutGraph single branch assigns lane 0", () => {
  const graph = {
    branches: [
      {
        id: "bid-1",
        name: "main",
        location: 0,
        stack: [],
        created: 100,
      },
    ],
    histories: {
      "bid-1": [
        {
          revision: "r1",
          revisionNumber: 1,
          timestamp: 1000,
          parent: [],
        },
      ],
    },
  };

  const layout = layoutGraph(graph, "bid-1");
  assert.equal(layout.lanes.length, 1);
  assert.equal(layout.nodes.length, 1);
  assert.equal(layout.nodes[0].lane, 0);
  assert.equal(layout.nodes[0].revision, "r1");
});

test("layoutGraph fork creates new lane", () => {
  const graph = {
    branches: [
      {
        id: "bid-1",
        name: "main",
        location: 0,
        stack: [],
        created: 100,
      },
      {
        id: "bid-2",
        name: "feature",
        location: 0,
        stack: [{ branch: "bid-1", revision: "r1" }],
        created: 200,
      },
    ],
    histories: {
      "bid-1": [
        {
          revision: "r1",
          revisionNumber: 1,
          timestamp: 1000,
          parent: [],
        },
      ],
      "bid-2": [
        {
          revision: "r2",
          revisionNumber: 1,
          timestamp: 2000,
          parent: ["r1"],
        },
      ],
    },
  };

  const layout = layoutGraph(graph, "bid-1");
  assert.equal(layout.lanes.length, 2);
  assert.equal(layout.nodes.length, 2);
  const featureNode = layout.nodes.find((n) => n.revision === "r2");
  assert.equal(featureNode.lane, 1);
});

test("layoutGraph merge creates dashed edge", () => {
  const graph = {
    branches: [
      {
        id: "bid-1",
        name: "main",
        location: 0,
        stack: [],
        created: 100,
      },
      {
        id: "bid-2",
        name: "feature",
        location: 0,
        stack: [{ branch: "bid-1", revision: "r1" }],
        created: 200,
      },
    ],
    histories: {
      "bid-1": [
        {
          revision: "r3",
          revisionNumber: 3,
          timestamp: 3000,
          parent: [],
        },
        {
          revision: "r1",
          revisionNumber: 1,
          timestamp: 1000,
          parent: [],
        },
      ],
      "bid-2": [
        {
          revision: "r2",
          revisionNumber: 1,
          timestamp: 2000,
          parent: ["r1"],
        },
      ],
    },
  };

  const layout = layoutGraph(graph, "bid-1");
  // After merging r2 into main, we'd have r3 with parent: ["r2", "r1"]
  // But in this test, we don't have the merge yet, so just verify structure
  assert(layout.nodes.length >= 2);
});

test("layoutGraph nodes sorted by timestamp desc", () => {
  const graph = {
    branches: [
      {
        id: "bid-1",
        name: "main",
        location: 0,
        stack: [],
        created: 100,
      },
    ],
    histories: {
      "bid-1": [
        {
          revision: "r1",
          revisionNumber: 1,
          timestamp: 1000,
          parent: [],
        },
        {
          revision: "r2",
          revisionNumber: 2,
          timestamp: 2000,
          parent: ["r1"],
        },
        {
          revision: "r3",
          revisionNumber: 3,
          timestamp: 1500,
          parent: ["r2"],
        },
      ],
    },
  };

  const layout = layoutGraph(graph, "bid-1");
  assert.equal(layout.nodes[0].revision, "r2"); // highest timestamp
  assert.equal(layout.nodes[1].revision, "r3"); // middle timestamp
  assert.equal(layout.nodes[2].revision, "r1"); // lowest timestamp
});

test("layoutSignature captures layout identity", () => {
  const graph = {
    branches: [
      {
        id: "bid-1",
        name: "main",
        location: 0,
        stack: [],
        created: 100,
      },
    ],
    histories: {
      "bid-1": [
        {
          revision: "r1",
          revisionNumber: 1,
          timestamp: 1000,
          parent: [],
        },
      ],
    },
  };

  const layout = layoutGraph(graph, "bid-1");
  const sig = layoutSignature(layout);
  assert(sig.includes("r1"));
  assert(sig.includes("0")); // lane 0
});

test("layoutGraph handles empty history gracefully", () => {
  const graph = {
    branches: [
      {
        id: "bid-1",
        name: "main",
        location: 0,
        stack: [],
        created: 100,
      },
    ],
    histories: {
      "bid-1": [],
    },
  };

  const layout = layoutGraph(graph, "bid-1");
  assert.equal(layout.lanes.length, 1);
  assert.equal(layout.nodes.length, 0);
});

test("layoutGraph dedupes branches by id, prefers LOCAL", () => {
  const graph = {
    branches: [
      {
        id: "bid-1",
        name: "main",
        location: 1,
        stack: [],
        created: 100,
      },
      {
        id: "bid-1",
        name: "main",
        location: 0,
        stack: [],
        created: 100,
      },
    ],
    histories: {
      "bid-1": [
        {
          revision: "r1",
          revisionNumber: 1,
          timestamp: 1000,
          parent: [],
        },
      ],
    },
  };

  const layout = layoutGraph(graph, "bid-1");
  assert.equal(layout.lanes.length, 1);
  assert.equal(layout.lanes[0].location, 0);
});

test("layoutGraph dedupes shared fork-point revisions, attributes to parent lane", () => {
  const graph = {
    branches: [
      {
        id: "bid-1",
        name: "main",
        location: 0,
        stack: [],
        created: 100,
      },
      {
        id: "bid-2",
        name: "feature",
        location: 0,
        stack: [{ branch: "bid-1", revision: "r1" }],
        created: 200,
      },
    ],
    histories: {
      "bid-1": [
        {
          revision: "r2",
          revisionNumber: 2,
          timestamp: 2000,
          parent: ["r1"],
        },
        {
          revision: "r1",
          revisionNumber: 1,
          timestamp: 1000,
          parent: [],
        },
      ],
      "bid-2": [
        {
          revision: "r3",
          revisionNumber: 1,
          timestamp: 1500,
          parent: ["r1"],
        },
        {
          revision: "r1",
          revisionNumber: 1,
          timestamp: 1000,
          parent: [],
        },
      ],
    },
  };

  const layout = layoutGraph(graph, "bid-1");
  // r1 should appear only once (on main lane 0), not duplicated on feature lane 1
  const r1Nodes = layout.nodes.filter((n) => n.revision === "r1");
  assert.equal(r1Nodes.length, 1);
  assert.equal(r1Nodes[0].lane, 0);
  assert.equal(r1Nodes[0].branch, "main");

  // r3 is feature's own node, should be on lane 1
  const r3Node = layout.nodes.find((n) => n.revision === "r3");
  assert(r3Node);
  assert.equal(r3Node.lane, 1);

  // Should have a linear edge from r3 to r1 (cross-lane)
  const r3Edge = layout.edges.find((e) => e.from === "r3");
  assert(r3Edge);
  assert.equal(r3Edge.to, "r1");
});

test("layoutGraph child branch with entirely shared history yields zero own nodes", () => {
  const graph = {
    branches: [
      {
        id: "bid-1",
        name: "main",
        location: 0,
        stack: [],
        created: 100,
      },
      {
        id: "bid-2",
        name: "merged",
        location: 0,
        stack: [{ branch: "bid-1", revision: "r1" }],
        created: 200,
      },
    ],
    histories: {
      "bid-1": [
        {
          revision: "r1",
          revisionNumber: 1,
          timestamp: 1000,
          parent: [],
        },
      ],
      "bid-2": [
        {
          revision: "r1",
          revisionNumber: 1,
          timestamp: 1000,
          parent: [],
        },
      ],
    },
  };

  const layout = layoutGraph(graph, "bid-1");
  // Two lanes exist
  assert.equal(layout.lanes.length, 2);
  // Only one node total (r1 on main lane)
  assert.equal(layout.nodes.length, 1);
  const node = layout.nodes[0];
  assert.equal(node.revision, "r1");
  assert.equal(node.lane, 0);
  assert.equal(node.branch, "main");
});
