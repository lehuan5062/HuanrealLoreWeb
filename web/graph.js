/**
 * Branch graph layout and rendering.
 * layoutGraph is pure and testable; renderGraph creates SVG.
 */

/**
 * Dedupe branches by id, preferring LOCAL (location 0) over REMOTE (location 1).
 * @param {object[]} branches raw branches from /api/graph
 * @returns {object[]} deduped branches, one per id
 */
export function dedupeBranches(branches) {
  const byId = new Map();
  for (const b of branches) {
    const existing = byId.get(b.id);
    if (!existing || b.location === 0) byId.set(b.id, b);
  }
  return Array.from(byId.values());
}

/**
 * Compute lane assignments and edge paths for a branch/revision graph.
 * Lane 0 = default branch (empty stack), children DFS-ordered by created.
 * Rows: all nodes sorted by timestamp desc, stable-sorted to preserve per-branch revisionNumber order.
 * Edges: linear (within branch), fork (to parent), merge (dashed).
 * @param {{ branches, histories }} graph from /api/graph
 * @param {string} currentBranchId the active branch's id
 * @returns {{ lanes: object[], nodes: object[], edges: object[] }}
 */
export function layoutGraph(graph, currentBranchId) {
  const { branches: rawBranches, histories } = graph;

  // Dedupe branches by id, preferring LOCAL
  const branches = dedupeBranches(rawBranches);

  // Assign lanes: lane 0 = default (empty stack), children by created time
  const lanes = [];
  const laneMap = new Map(); // branchId -> lane index
  const queue = branches.filter((b) => !b.stack || b.stack.length === 0);
  queue.sort((a, b) => (a.created || 0) - (b.created || 0));

  for (const b of queue) {
    const lane = lanes.length;
    lanes.push(b);
    laneMap.set(b.id, lane);

    // Find all children (branches whose stack points to this branch)
    const children = branches.filter(
      (ch) =>
        ch.stack &&
        ch.stack.length > 0 &&
        ch.stack[0].branch === b.id
    );
    children.sort((a, b) => (a.created || 0) - (b.created || 0));
    queue.push(...children);
  }

  // Collect all nodes: (lane, branch, revision)
  const nodes = [];
  const nodeMap = new Map(); // "revision" -> node
  const revisionToLane = new Map(); // revision -> lane index

  for (let laneIdx = 0; laneIdx < lanes.length; laneIdx++) {
    const branch = lanes[laneIdx];
    const history = histories[branch.id] || [];
    for (const rev of history) {
      // Skip revisions already in nodeMap (shared with an earlier/parent lane)
      if (nodeMap.has(rev.revision)) continue;

      const node = {
        revision: rev.revision,
        revisionNumber: rev.revisionNumber,
        lane: laneIdx,
        branch: branch.name,
        branchId: branch.id,
        timestamp: rev.timestamp || 0,
        message: rev.message || "",
        parent: rev.parent || [],
      };
      nodes.push(node);
      nodeMap.set(rev.revision, node);
      revisionToLane.set(rev.revision, laneIdx);
    }
  }

  // Sort nodes: timestamp desc, then per-branch revisionNumber desc
  nodes.sort((a, b) => {
    const tsDiff = (b.timestamp || 0) - (a.timestamp || 0);
    if (tsDiff !== 0) return tsDiff;
    // Same timestamp: sort by revisionNumber desc within the same branch, else by creation order
    if (a.branchId === b.branchId) return (b.revisionNumber || 0) - (a.revisionNumber || 0);
    return 0;
  });

  // Build edges
  const edges = [];
  for (const node of nodes) {
    // Linear edge: within-branch parent
    if (node.parent && node.parent[0]) {
      const parentNode = nodeMap.get(node.parent[0]);
      if (parentNode) {
        edges.push({
          type: "linear",
          from: node.revision,
          to: node.parent[0],
          fromLane: node.lane,
          toLane: parentNode.lane,
        });
      } else {
        // Ghost stub: fork point outside history window
        edges.push({
          type: "fork",
          from: node.revision,
          to: node.parent[0],
          fromLane: node.lane,
          toLane: -1, // unknown
          ghost: true,
        });
      }
    }

    // Merge edge: dashed line to merge parent
    if (node.parent && node.parent[1]) {
      const mergeNode = nodeMap.get(node.parent[1]);
      if (mergeNode) {
        edges.push({
          type: "merge",
          from: node.revision,
          to: node.parent[1],
          fromLane: node.lane,
          toLane: mergeNode.lane,
        });
      }
    }
  }

  return { lanes, nodes, edges, laneMap };
}

/**
 * Render a branch graph as SVG given layout from layoutGraph.
 * @param {SVGElement} svgEl target SVG element
 * @param {object} layout from layoutGraph
 * @param {{ onNodeClick?: (node: object, evt: Event) => void, currentRevision?: string }} opts
 */
export function renderGraph(svgEl, layout, opts = {}) {
  const { lanes, nodes, edges } = layout;
  const { onNodeClick, currentRevision } = opts;

  // Clear existing content
  while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);

  if (nodes.length === 0) {
    svgEl.innerHTML = '<text x="10" y="20" fill="var(--muted)">No history</text>';
    return;
  }

  // Dimensions
  const NODE_RADIUS = 4;
  const LANE_WIDTH = 80;
  const ROW_HEIGHT = 40;
  const PADDING = 20;
  const WIDTH = Math.max(300, lanes.length * LANE_WIDTH + PADDING * 2);
  const HEIGHT = Math.max(200, nodes.length * ROW_HEIGHT + PADDING * 2);

  // Preserve viewBox across re-renders if content size is stable
  let view = svgEl._view;
  if (!view || view.contentWidth !== WIDTH || view.contentHeight !== HEIGHT) {
    view = { x: 0, y: 0, w: WIDTH, h: HEIGHT, contentWidth: WIDTH, contentHeight: HEIGHT };
  }
  svgEl._view = view;
  svgEl.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  svgEl.setAttribute("width", "100%");
  svgEl.setAttribute("height", "100%");

  // Reusable element creation
  const ns = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}) => {
    const e = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };

  // Render edges first (so they appear behind nodes)
  for (const edge of edges) {
    const fromNode = nodes.find((n) => n.revision === edge.from);
    const toNode = nodes.find((n) => n.revision === edge.to);
    if (!fromNode || !toNode) continue;

    const fromX = PADDING + fromNode.lane * LANE_WIDTH + LANE_WIDTH / 2;
    const fromY = PADDING + nodes.indexOf(fromNode) * ROW_HEIGHT + ROW_HEIGHT / 2;
    const toX = PADDING + toNode.lane * LANE_WIDTH + LANE_WIDTH / 2;
    const toY = PADDING + nodes.indexOf(toNode) * ROW_HEIGHT + ROW_HEIGHT / 2;

    if (edge.type === "linear" && fromNode.lane === toNode.lane) {
      // Vertical line
      const line = el("line", {
        x1: fromX,
        y1: fromY,
        x2: toX,
        y2: toY,
        stroke: `var(--lane-${fromNode.lane % 8})`,
        "stroke-width": "2",
      });
      svgEl.appendChild(line);
    } else if (edge.type === "merge") {
      // Dashed line for merge
      const path = el("line", {
        x1: fromX,
        y1: fromY,
        x2: toX,
        y2: toY,
        stroke: `var(--lane-${fromNode.lane % 8})`,
        "stroke-width": "1.5",
        "stroke-dasharray": "4,2",
      });
      svgEl.appendChild(path);
    } else if (fromNode.lane !== toNode.lane) {
      // Bezier curve between lanes
      const ctrl1X = fromX + (toX - fromX) * 0.3;
      const ctrl2X = fromX + (toX - fromX) * 0.7;
      const pathStr = `M ${fromX} ${fromY} C ${ctrl1X} ${fromY} ${ctrl2X} ${toY} ${toX} ${toY}`;
      const path = el("path", {
        d: pathStr,
        fill: "none",
        stroke: `var(--lane-${fromNode.lane % 8})`,
        "stroke-width": "1.5",
      });
      svgEl.appendChild(path);
    }
  }

  // Render nodes
  const dragState = { startX: 0, startY: 0, dragged: false };

  for (const node of nodes) {
    const x = PADDING + node.lane * LANE_WIDTH + LANE_WIDTH / 2;
    const y = PADDING + nodes.indexOf(node) * ROW_HEIGHT + ROW_HEIGHT / 2;

    // Ring for current revision (behind the dot)
    if (currentRevision === node.revision) {
      const ring = el("circle", {
        cx: x,
        cy: y,
        r: NODE_RADIUS + 4,
        fill: "none",
        stroke: `var(--lane-${node.lane % 8})`,
        "stroke-width": "1.5",
        opacity: "0.4",
      });
      svgEl.appendChild(ring);
    }

    // Dot
    const dot = el("circle", {
      cx: x,
      cy: y,
      r: NODE_RADIUS,
      fill: `var(--lane-${node.lane % 8})`,
      class: "graph-node" + (currentRevision === node.revision ? " current-rev" : ""),
      style: "cursor: pointer",
    });

    if (onNodeClick) {
      dot.addEventListener("click", (evt) => {
        if (!dragState.dragged) onNodeClick(node, evt);
        dragState.dragged = false;
      });
    }

    // Hover tooltip
    const title = el("title");
    title.textContent = `${node.branch} #${node.revisionNumber}\n${node.revision.slice(0, 12)}\n${node.message}`;
    dot.appendChild(title);

    svgEl.appendChild(dot);

    // Branch tip label (latest node in lane)
    const isLatest = !nodes.some(
      (n) =>
        n.branchId === node.branchId &&
        ((n.timestamp || 0) > (node.timestamp || 0) ||
          ((n.timestamp || 0) === (node.timestamp || 0) &&
            (n.revisionNumber || 0) > (node.revisionNumber || 0)))
    );

    if (isLatest) {
      const label = el("text", {
        x: x + NODE_RADIUS + 6,
        y: y + 4,
        "font-size": "11",
        fill: "var(--text)",
        class: "graph-label",
      });
      label.textContent = node.branch;
      svgEl.appendChild(label);
    }
  }

  // Zoom/pan interactions (only attach once per SVG element)
  if (!svgEl._zoomAttached) {
    svgEl._zoomAttached = true;
    svgEl._dragState = dragState;
    attachGraphInteractions(svgEl);
  } else {
    svgEl._dragState = dragState;
  }

  // CSS for lane colors (defined inline in style.css)
}

/**
 * Clamp a pan offset so some content always stays in view. When the view is
 * wider/taller than the content (zoomed out), the range inverts — min/max of
 * the two bounds keeps panning possible in both regimes instead of pinning
 * the view to 0 (which made dragging a no-op at fit zoom).
 */
function clampPan(value, contentSize, viewSize) {
  const lo = Math.min(0, contentSize - viewSize);
  const hi = Math.max(0, contentSize - viewSize);
  return Math.max(lo, Math.min(hi, value));
}

/** Attach wheel zoom, pointer drag, and touch interactions to the SVG. */
function attachGraphInteractions(svgEl) {
  // Wheel zoom at cursor
  svgEl.addEventListener("wheel", (evt) => {
    evt.preventDefault();
    const view = svgEl._view;
    if (!view) return;

    const zoom = evt.deltaY < 0 ? 1.1 : 1 / 1.1;
    const rect = svgEl.getBoundingClientRect();
    const cursorX = evt.clientX - rect.left;
    const cursorY = evt.clientY - rect.top;
    const svgCoordX = view.x + (cursorX / rect.width) * view.w;
    const svgCoordY = view.y + (cursorY / rect.height) * view.h;

    const newW = Math.max(view.contentWidth * 0.2, Math.min(view.contentWidth * 5, view.w / zoom));
    const newH = (newW / view.w) * view.h;
    const newX = svgCoordX - ((cursorX / rect.width) * newW);
    const newY = svgCoordY - ((cursorY / rect.height) * newH);

    view.w = newW;
    view.h = newH;
    view.x = clampPan(newX, view.contentWidth, newW);
    view.y = clampPan(newY, view.contentHeight, newH);
    svgEl.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
  });

  // Drag to pan
  let lastX = 0, lastY = 0;
  svgEl.addEventListener("pointerdown", (evt) => {
    evt.preventDefault(); // stop text-selection/native drag from eating the gesture
    svgEl.setPointerCapture(evt.pointerId);
    lastX = evt.clientX;
    lastY = evt.clientY;
    const dragState = svgEl._dragState;
    if (dragState) {
      dragState.startX = evt.clientX;
      dragState.startY = evt.clientY;
      dragState.dragged = false;
    }
    svgEl.style.cursor = "grabbing";
  });

  svgEl.addEventListener("pointermove", (evt) => {
    if (evt.buttons === 0) return;
    const view = svgEl._view;
    if (!view) return;

    const dx = evt.clientX - lastX;
    const dy = evt.clientY - lastY;
    const rect = svgEl.getBoundingClientRect();
    const svgDX = -(dx / rect.width) * view.w;
    const svgDY = -(dy / rect.height) * view.h;

    view.x = clampPan(view.x + svgDX, view.contentWidth, view.w);
    view.y = clampPan(view.y + svgDY, view.contentHeight, view.h);
    svgEl.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);

    lastX = evt.clientX;
    lastY = evt.clientY;

    const dragState = svgEl._dragState;
    if (dragState) {
      const moved = Math.hypot(evt.clientX - dragState.startX, evt.clientY - dragState.startY);
      if (moved > 4) dragState.dragged = true;
    }
  });

  svgEl.addEventListener("pointerup", (evt) => {
    svgEl.style.cursor = "grab";
  });

  svgEl.addEventListener("pointercancel", () => {
    svgEl.style.cursor = "grab";
  });
}

/**
 * Zoom the graph around the center of the view.
 * @param {SVGElement} svgEl the graph SVG
 * @param {number} factor zoom factor (e.g., 1.1 to zoom in, 1/1.1 to zoom out)
 */
export function zoomGraph(svgEl, factor) {
  const view = svgEl._view;
  if (!view) return;

  const centerX = view.x + view.w / 2;
  const centerY = view.y + view.h / 2;
  const newW = Math.max(view.contentWidth * 0.2, Math.min(view.contentWidth * 5, view.w / factor));
  const newH = (newW / view.w) * view.h;
  view.x = centerX - newW / 2;
  view.y = centerY - newH / 2;
  view.w = newW;
  view.h = newH;

  // Clamp to content bounds
  view.x = clampPan(view.x, view.contentWidth, view.w);
  view.y = clampPan(view.y, view.contentHeight, view.h);

  svgEl.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
}

/**
 * Fit the graph to show all content.
 * @param {SVGElement} svgEl the graph SVG
 */
export function fitGraph(svgEl) {
  const view = svgEl._view;
  if (!view) return;
  view.x = 0;
  view.y = 0;
  view.w = view.contentWidth;
  view.h = view.contentHeight;
  svgEl.setAttribute("viewBox", `0 0 ${view.contentWidth} ${view.contentHeight}`);
}

/**
 * Check if layout or signature changed (for change detection).
 * @param {object} layout from layoutGraph
 * @returns {string} signature
 */
export function layoutSignature(layout) {
  return JSON.stringify({
    nodes: layout.nodes.map((n) => [n.revision, n.lane]),
    edges: layout.edges.length,
  });
}
