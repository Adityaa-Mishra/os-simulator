/**
 * Deadlock Visualizer & RAG Renderer
 * Provides:
 * 1. Cycle detection on bipartite directed Resource Allocation Graph (RAG).
 * 2. Deterministic SVG layout for RAG with process circles, resource rectangles, and cycle highlights.
 * 3. Formatted matrix tables for Available, Allocation, Max, and Need.
 * 4. Step-by-step Banker's Safety and Request state cards.
 */

export class DeadlockRenderer {
  /**
   * Cycle detection using 3-color DFS on the Resource Allocation Graph.
   * Nodes: "P0", "P1", ... and "R0", "R1", ...
   * Edges:
   *   Allocation: Rj -> Pi (if allocation[i][j] > 0)
   *   Request:    Pi -> Rj (if need[i][j] > 0)
   */
  static detectRagCycle(processes, numResources, allocation, need) {
    const pCount = processes.length;
    const rCount = numResources;

    // Node list
    const nodes = [];
    for (let i = 0; i < pCount; i++) nodes.push(`P${i}`);
    for (let j = 0; j < rCount; j++) nodes.push(`R${j}`);

    // Build adjacency list
    const adj = new Map();
    nodes.forEach(n => adj.set(n, []));

    // Allocation edges: Rj -> Pi
    for (let i = 0; i < pCount; i++) {
      for (let j = 0; j < rCount; j++) {
        if (allocation[i][j] > 0) {
          adj.get(`R${j}`).push({ target: `P${i}`, weight: allocation[i][j], type: 'allocation' });
        }
      }
    }

    // Request edges: Pi -> Rj
    for (let i = 0; i < pCount; i++) {
      for (let j = 0; j < rCount; j++) {
        if (need[i][j] > 0) {
          adj.get(`P${i}`).push({ target: `R${j}`, weight: need[i][j], type: 'request' });
        }
      }
    }

    // Colors: 0 = unvisited (white), 1 = visiting (gray), 2 = visited (black)
    const color = new Map();
    nodes.forEach(n => color.set(n, 0));

    const path = [];
    let cycleNodes = [];
    const cycleEdges = [];
    let hasCycle = false;

    function dfs(u) {
      color.set(u, 1);
      path.push(u);

      const neighbors = adj.get(u) || [];
      for (const edge of neighbors) {
        const v = edge.target;
        if (color.get(v) === 1) {
          // Cycle found!
          hasCycle = true;
          const cycleStartIdx = path.indexOf(v);
          cycleNodes = path.slice(cycleStartIdx);
          cycleNodes.push(v); // close the loop representation

          for (let k = 0; k < cycleNodes.length - 1; k++) {
            cycleEdges.push(`${cycleNodes[k]}->${cycleNodes[k + 1]}`);
          }
          return true;
        } else if (color.get(v) === 0) {
          if (dfs(v)) return true;
        }
      }

      path.pop();
      color.set(u, 2);
      return false;
    }

    for (const node of nodes) {
      if (color.get(node) === 0) {
        if (dfs(node)) break;
      }
    }

    return {
      hasCycle,
      cycleNodes,
      cycleEdges: new Set(cycleEdges)
    };
  }

  /**
   * Render Resource Allocation Graph (SVG).
   * Deterministic 2-column layout: Processes on left, Resources on right.
   */
  static renderRag(container, state, cycleInfo = null) {
    if (!container || !state) return;

    const { processes, available, allocation, need } = state;
    const pCount = processes.length;
    const rCount = available.length;

    // Detect cycle if not provided
    const cycle = cycleInfo || this.detectRagCycle(processes, rCount, allocation, need);

    const svgWidth = 660;
    const maxHeight = Math.max(pCount, rCount);
    const rowSpacing = Math.max(64, Math.min(80, Math.floor(400 / maxHeight)));
    const svgHeight = Math.max(340, maxHeight * rowSpacing + 80);

    const leftX = 140;   // Process column
    const rightX = 520;  // Resource column
    const startY = 60;

    // Node coordinates
    const pCoords = [];
    for (let i = 0; i < pCount; i++) {
      const y = startY + i * rowSpacing + (maxHeight - pCount) * (rowSpacing / 2);
      pCoords.push({ x: leftX, y, id: `P${i}`, name: processes[i] });
    }

    const rCoords = [];
    for (let j = 0; j < rCount; j++) {
      const y = startY + j * rowSpacing + (maxHeight - rCount) * (rowSpacing / 2);
      rCoords.push({ x: rightX, y, id: `R${j}`, name: `R${j}`, avail: available[j] });
    }

    // Build edges
    const edges = [];

    // Allocation edges: Rj -> Pi
    for (let i = 0; i < pCount; i++) {
      for (let j = 0; j < rCount; j++) {
        if (allocation[i][j] > 0) {
          const edgeKey = `R${j}->P${i}`;
          const isCycle = cycle.cycleEdges && cycle.cycleEdges.has(edgeKey);
          edges.push({
            from: rCoords[j],
            to: pCoords[i],
            type: 'allocation',
            weight: allocation[i][j],
            isCycle,
            label: `alloc: ${allocation[i][j]}`
          });
        }
      }
    }

    // Request edges: Pi -> Rj
    for (let i = 0; i < pCount; i++) {
      for (let j = 0; j < rCount; j++) {
        if (need[i][j] > 0) {
          const edgeKey = `P${i}->R${j}`;
          const isCycle = cycle.cycleEdges && cycle.cycleEdges.has(edgeKey);
          edges.push({
            from: pCoords[i],
            to: rCoords[j],
            type: 'request',
            weight: need[i][j],
            isCycle,
            label: `need: ${need[i][j]}`
          });
        }
      }
    }

    // Render SVG
    container.innerHTML = `
      <div class="rag-visualizer-card">
        <div class="rag-header">
          <div>
            <span class="rag-title">Resource Allocation Graph (RAG)</span>
            <span class="rag-subtitle">${pCount} Processes \u2194 ${rCount} Resources | Deterministic Directed Graph</span>
          </div>
          <div class="rag-legend">
            <span class="legend-chip alloc"><span class="legend-dot alloc"></span> Allocation (R \u2192 P)</span>
            <span class="legend-chip req"><span class="legend-dot req"></span> Request / Need (P \u2192 R)</span>
            ${cycle.hasCycle ? '<span class="legend-chip cycle"><span class="legend-dot cycle"></span> Deadlock Cycle</span>' : ''}
          </div>
        </div>

        <!-- Cycle Status Banner -->
        <div class="rag-cycle-banner ${cycle.hasCycle ? 'alert-danger' : 'alert-success'}">
          ${cycle.hasCycle
            ? `<strong>\u26A0\uFE0F Directed Cycle Detected:</strong> <code>${cycle.cycleNodes.join(' \u2192 ')}</code>
               <div class="cycle-note">Educational Note: In a multi-instance resource system, a cycle is a <em>necessary</em> condition for deadlock, but <em>not sufficient</em>. Banker's Safety Algorithm provides the definitive deadlock status.</div>`
            : `<strong>\u2705 No Cycle Detected:</strong> The Resource Allocation Graph contains no directed cycles. The system is guaranteed deadlock-free.`
          }
        </div>

        <div class="rag-svg-container">
          <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="rag-svg">
            <defs>
              <!-- Arrowhead for Allocation: Cyan / Emerald -->
              <marker id="arrow-alloc" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
              </marker>
              <!-- Arrowhead for Request: Amber / Orange -->
              <marker id="arrow-req" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#f59e0b" />
              </marker>
              <!-- Arrowhead for Cycle: Crimson Red -->
              <marker id="arrow-cycle" viewBox="0 0 10 10" refX="28" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 1 L 10 5 L 0 9 z" fill="#ef4444" />
              </marker>
            </defs>

            <!-- Column Titles -->
            <text x="${leftX}" y="28" text-anchor="middle" class="rag-col-label">Processes (P)</text>
            <text x="${rightX}" y="28" text-anchor="middle" class="rag-col-label">Resources (R)</text>

            <!-- Edges -->
            <g class="rag-edges">
              ${edges.map(e => {
                const isCycle = e.isCycle;
                const marker = isCycle ? 'url(#arrow-cycle)' : (e.type === 'allocation' ? 'url(#arrow-alloc)' : 'url(#arrow-req)');
                const strokeColor = isCycle ? '#ef4444' : (e.type === 'allocation' ? '#10b981' : '#f59e0b');
                const strokeWidth = isCycle ? '2.5' : '1.75';
                const strokeDash = e.type === 'request' && !isCycle ? '4 3' : 'none';

                // Slight curve between points
                const dx = e.to.x - e.from.x;
                const dy = e.to.y - e.from.y;
                const midX = (e.from.x + e.to.x) / 2;
                const midY = (e.from.y + e.to.y) / 2 + (e.type === 'allocation' ? -18 : 18);

                return `
                  <path d="M ${e.from.x} ${e.from.y} Q ${midX} ${midY} ${e.to.x} ${e.to.y}"
                        fill="none"
                        stroke="${strokeColor}"
                        stroke-width="${strokeWidth}"
                        stroke-dasharray="${strokeDash}"
                        marker-end="${marker}"
                        class="rag-edge ${isCycle ? 'cycle-edge' : ''}" />
                  <text x="${midX}" y="${midY + (e.type === 'allocation' ? -4 : 12)}"
                        text-anchor="middle"
                        fill="${strokeColor}"
                        font-size="10"
                        font-family="var(--font-mono)"
                        class="rag-edge-label ${isCycle ? 'cycle-edge-label' : ''}">
                    ${e.label}
                  </text>
                `;
              }).join('')}
            </g>

            <!-- Process Nodes (Circles) -->
            <g class="rag-process-nodes">
              ${pCoords.map(p => {
                const inCycle = cycle.cycleNodes.includes(p.id);
                return `
                  <g class="rag-node process-node ${inCycle ? 'in-cycle' : ''}" transform="translate(${p.x}, ${p.y})">
                    <circle r="22" class="node-shape ${inCycle ? 'shape-cycle' : 'shape-process'}" />
                    <text text-anchor="middle" dy="4" class="node-text">${p.name}</text>
                  </g>
                `;
              }).join('')}
            </g>

            <!-- Resource Nodes (Rectangles) -->
            <g class="rag-resource-nodes">
              ${rCoords.map(r => {
                const inCycle = cycle.cycleNodes.includes(r.id);
                return `
                  <g class="rag-node resource-node ${inCycle ? 'in-cycle' : ''}" transform="translate(${r.x}, ${r.y})">
                    <rect x="-35" y="-20" width="70" height="40" rx="6" class="node-shape ${inCycle ? 'shape-cycle' : 'shape-resource'}" />
                    <text text-anchor="middle" y="-2" class="node-text res-title">${r.name}</text>
                    <text text-anchor="middle" y="12" class="node-subtext">Avail: ${r.avail}</text>
                  </g>
                `;
              }).join('')}
            </g>
          </svg>
        </div>
      </div>
    `;
  }

  /**
   * Render matrix tables (Available, Allocation, Max, Need).
   */
  static renderMatrixTables(container, state, options = {}) {
    if (!container || !state) return;

    const { processes, available, max, allocation, need } = state;
    const pCount = processes.length;
    const rCount = available.length;
    const highlightProcess = options.highlightProcess || null;

    container.innerHTML = `
      <div class="deadlock-matrices-grid">
        <!-- Available Vector -->
        <div class="matrix-card available-card">
          <div class="matrix-card-header">
            <span class="matrix-title">Available Vector</span>
            <span class="matrix-badge">1 \u00D7 ${rCount}</span>
          </div>
          <div class="matrix-table-wrap">
            <table class="deadlock-table available-table">
              <thead>
                <tr>
                  ${available.map((_, j) => `<th>R${j}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                <tr>
                  ${available.map(val => `<td><span class="cell-val available">${val}</span></td>`).join('')}
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Allocation Matrix -->
        <div class="matrix-card">
          <div class="matrix-card-header">
            <span class="matrix-title">Allocation Matrix</span>
            <span class="matrix-badge">${pCount} \u00D7 ${rCount}</span>
          </div>
          <div class="matrix-table-wrap">
            <table class="deadlock-table">
              <thead>
                <tr>
                  <th>Proc</th>
                  ${available.map((_, j) => `<th>R${j}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${allocation.map((row, i) => `
                  <tr class="${processes[i] === highlightProcess ? 'row-highlight' : ''}">
                    <td class="proc-cell">${processes[i]}</td>
                    ${row.map(val => `<td><span class="cell-val">${val}</span></td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Max Matrix -->
        <div class="matrix-card">
          <div class="matrix-card-header">
            <span class="matrix-title">Max Matrix</span>
            <span class="matrix-badge">${pCount} \u00D7 ${rCount}</span>
          </div>
          <div class="matrix-table-wrap">
            <table class="deadlock-table">
              <thead>
                <tr>
                  <th>Proc</th>
                  ${available.map((_, j) => `<th>R${j}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${max.map((row, i) => `
                  <tr class="${processes[i] === highlightProcess ? 'row-highlight' : ''}">
                    <td class="proc-cell">${processes[i]}</td>
                    ${row.map(val => `<td><span class="cell-val">${val}</span></td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Need Matrix -->
        <div class="matrix-card">
          <div class="matrix-card-header">
            <span class="matrix-title">Need Matrix (Max \u2212 Alloc)</span>
            <span class="matrix-badge">${pCount} \u00D7 ${rCount}</span>
          </div>
          <div class="matrix-table-wrap">
            <table class="deadlock-table">
              <thead>
                <tr>
                  <th>Proc</th>
                  ${available.map((_, j) => `<th>R${j}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${need.map((row, i) => `
                  <tr class="${processes[i] === highlightProcess ? 'row-highlight' : ''}">
                    <td class="proc-cell">${processes[i]}</td>
                    ${row.map(val => `<td><span class="cell-val need">${val}</span></td>`).join('')}
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render safety step playback status card.
   */
  static renderSafetyStep(container, snapshot, processes) {
    if (!container || !snapshot) return;

    const { work, finish, safeSequence, action, educationalNote, selectedProcess, phase } = snapshot;

    container.innerHTML = `
      <div class="safety-step-card ${phase === 'safe_complete' ? 'step-safe' : (phase === 'unsafe_deadlock' ? 'step-unsafe' : '')}">
        <div class="safety-step-header">
          <div class="step-badge">Step ${snapshot.step}</div>
          <div class="step-phase">${phase.toUpperCase()}</div>
        </div>

        <!-- Work Vector & Safe Sequence Banner -->
        <div class="safety-metrics-row">
          <div class="metric-pill">
            <span class="metric-lbl">Current Work:</span>
            <span class="metric-val">[${(work || []).join(', ')}]</span>
          </div>
          <div class="metric-pill">
            <span class="metric-lbl">Safe Sequence:</span>
            <span class="metric-val safe-seq-display">
              ${safeSequence && safeSequence.length > 0 ? `<${safeSequence.join(', ')}>` : 'None yet'}
            </span>
          </div>
          ${selectedProcess ? `
            <div class="metric-pill selected-proc-pill">
              <span class="metric-lbl">Selected:</span>
              <span class="metric-val">${selectedProcess}</span>
            </div>
          ` : ''}
        </div>

        <!-- Process Finish Status Pills -->
        <div class="finish-pills-row">
          <span class="finish-row-lbl">Finish Vector:</span>
          ${(finish || []).map((f, i) => `
            <span class="finish-pill ${f ? 'done' : 'pending'}">
              ${processes[i] || `P${i}`}: <strong>${f ? 'TRUE' : 'FALSE'}</strong>
            </span>
          `).join('')}
        </div>

        <!-- Action explanation -->
        <div class="safety-action-desc">
          <strong>Action:</strong> ${action}
        </div>

        <!-- Educational Note -->
        ${educationalNote ? `
          <div class="safety-edu-note">
            <span class="edu-icon">\uD83D\uDCA1</span> ${educationalNote}
          </div>
        ` : ''}
      </div>
    `;
  }
}
