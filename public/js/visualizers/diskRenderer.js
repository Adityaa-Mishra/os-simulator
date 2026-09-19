/**
 * Disk Scheduling Visualizer
 * Pure rendering functions for:
 * 1. Linear cylinder track with active head, pending requests, and serviced requests.
 * 2. 2D Seek trajectory graph (SVG) tracking head movements across time steps.
 */

export class DiskRenderer {
  /**
   * Render horizontal cylinder track with head and request pins.
   * @param {HTMLElement} container
   * @param {Object} snapshot - Current active snapshot
   * @param {number} diskSize - Total cylinder count (0 to diskSize - 1)
   */
  static renderCylinderTrack(container, snapshot, diskSize) {
    if (!container || !snapshot || !snapshot.state) return;

    const { currentHead, pendingRequests, servicedRequests, direction } = snapshot.state;
    const maxCylinder = diskSize - 1;

    // Helper to calculate percentage position
    const getPercent = (cyl) => Math.max(0, Math.min(100, (cyl / maxCylinder) * 100));

    container.innerHTML = `
      <div class="cylinder-track-card">
        <div class="cylinder-track-header">
          <div>
            <span class="track-title">Physical Cylinder Track</span>
            <span class="track-subtitle">Range: 0 – ${maxCylinder} cylinders | Direction: <strong>${direction.toUpperCase()}</strong></span>
          </div>
          <div class="track-head-badge">
            Current Head: <strong style="font-family: var(--font-mono); font-size: var(--text-base); color: var(--accent-primary);">${currentHead}</strong>
          </div>
        </div>

        <!-- The Physical Axis -->
        <div class="track-rail-wrapper">
          <div class="track-rail">
            <!-- Ticks & Labels at 0%, 25%, 50%, 75%, 100% -->
            <div class="track-tick-mark" style="left: 0%;"><span>0</span></div>
            <div class="track-tick-mark" style="left: 25%;"><span>${Math.round(maxCylinder * 0.25)}</span></div>
            <div class="track-tick-mark" style="left: 50%;"><span>${Math.round(maxCylinder * 0.5)}</span></div>
            <div class="track-tick-mark" style="left: 75%;"><span>${Math.round(maxCylinder * 0.75)}</span></div>
            <div class="track-tick-mark" style="left: 100%;"><span>${maxCylinder}</span></div>

            <!-- Pending Request Pins -->
            ${pendingRequests.map(r => `
              <div class="request-pin pending" style="left: ${getPercent(r)}%;" title="Pending: Cylinder ${r}">
                <span class="pin-dot"></span>
                <span class="pin-label">${r}</span>
              </div>
            `).join('')}

            <!-- Serviced Request Pins -->
            ${servicedRequests.map(r => `
              <div class="request-pin serviced" style="left: ${getPercent(r)}%;" title="Serviced: Cylinder ${r}">
                <span class="pin-dot"></span>
                <span class="pin-label">${r}</span>
              </div>
            `).join('')}

            <!-- Active Head Cursor -->
            <div class="head-cursor" style="left: ${getPercent(currentHead)}%;">
              <div class="head-arrow">▼</div>
              <div class="head-bubble">${currentHead}</div>
            </div>
          </div>
        </div>

        <!-- Legend -->
        <div class="track-legend">
          <div class="legend-item"><span class="legend-dot head"></span> Active Head</div>
          <div class="legend-item"><span class="legend-dot pending"></span> Pending Request</div>
          <div class="legend-item"><span class="legend-dot serviced"></span> Serviced Request</div>
        </div>
      </div>
    `;
  }

  /**
   * Render 2D Seek Trajectory Graph (SVG).
   * X-axis: Cylinder (0 to diskSize - 1)
   * Y-axis: Step / Time (0 to total steps)
   * @param {HTMLElement} container
   * @param {Array<Object>} snapshots - All timeline snapshots
   * @param {number} currentStepIndex - Current playback step
   * @param {number} diskSize - Total cylinders
   */
  static renderSeekTrajectory(container, snapshots, currentStepIndex, diskSize) {
    if (!container || !snapshots || snapshots.length === 0) return;

    const maxCylinder = diskSize - 1;
    const totalSteps = snapshots.length - 1;

    const svgWidth = 800;
    const svgHeight = Math.max(260, snapshots.length * 36 + 60);
    const padding = { top: 30, right: 40, bottom: 40, left: 60 };

    const graphWidth = svgWidth - padding.left - padding.right;
    const graphHeight = svgHeight - padding.top - padding.bottom;

    const getX = (cyl) => padding.left + (cyl / maxCylinder) * graphWidth;
    const getY = (step) => padding.top + (step / Math.max(1, totalSteps)) * graphHeight;

    // Build path segments
    let pathD = '';
    const points = [];

    for (let i = 0; i <= currentStepIndex && i < snapshots.length; i++) {
      const snap = snapshots[i];
      const x = getX(snap.state.currentHead);
      const y = getY(i);
      points.push({ x, y, snap, index: i });

      if (i === 0) {
        pathD += `M ${x} ${y}`;
      } else {
        pathD += ` L ${x} ${y}`;
      }
    }

    container.innerHTML = `
      <div class="trajectory-card">
        <div class="trajectory-header">
          <span class="track-title">Head Seek Trajectory Graph</span>
          <span class="track-subtitle">Visual timeline of seek movements across cylinders</span>
        </div>

        <div class="trajectory-svg-wrapper">
          <svg viewBox="0 0 ${svgWidth} ${svgHeight}" class="trajectory-svg">
            <!-- Grid Lines (Vertical Cylinders) -->
            ${[0, 0.25, 0.5, 0.75, 1].map(pct => {
              const x = padding.left + pct * graphWidth;
              const cylVal = Math.round(pct * maxCylinder);
              return `
                <line x1="${x}" y1="${padding.top}" x2="${x}" y2="${svgHeight - padding.bottom}" stroke="var(--border-color)" stroke-dasharray="3,3" />
                <text x="${x}" y="${svgHeight - padding.bottom + 20}" fill="var(--text-muted)" font-size="11" text-anchor="middle" font-family="var(--font-mono)">${cylVal}</text>
              `;
            }).join('')}

            <!-- Grid Lines (Horizontal Steps) -->
            ${snapshots.map((s, idx) => {
              const y = getY(idx);
              return `
                <line x1="${padding.left}" y1="${y}" x2="${svgWidth - padding.right}" y2="${y}" stroke="var(--border-color)" stroke-opacity="0.4" />
                <text x="${padding.left - 12}" y="${y + 4}" fill="var(--text-muted)" font-size="10" text-anchor="end" font-family="var(--font-mono)">Step ${idx}</text>
              `;
            }).join('')}

            <!-- Trajectory Path -->
            ${pathD ? `
              <path d="${pathD}" fill="none" stroke="var(--accent-primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
            ` : ''}

            <!-- Node Points -->
            ${points.map(pt => {
              const isCurrent = pt.index === currentStepIndex;
              const isBoundary = pt.snap.state.stepType === 'boundary';
              const isWrap = pt.snap.state.stepType === 'wrap';
              const isService = pt.snap.state.stepType === 'service';

              let nodeColor = 'var(--accent-primary)';
              if (isBoundary) nodeColor = 'var(--accent-warning)';
              if (isWrap) nodeColor = 'var(--accent-danger)';
              if (isService) nodeColor = 'var(--accent-success)';

              return `
                <g class="trajectory-node ${isCurrent ? 'active' : ''}">
                  <circle cx="${pt.x}" cy="${pt.y}" r="${isCurrent ? 7 : 4.5}" fill="${nodeColor}" stroke="#ffffff" stroke-width="${isCurrent ? 2.5 : 1.5}" />
                  ${isCurrent ? `
                    <circle cx="${pt.x}" cy="${pt.y}" r="12" fill="none" stroke="${nodeColor}" stroke-width="1.5" stroke-opacity="0.6" />
                  ` : ''}
                  <text x="${pt.x + 10}" y="${pt.y + 4}" fill="var(--text-primary)" font-size="11" font-weight="700" font-family="var(--font-mono)">
                    ${pt.snap.state.currentHead}${pt.snap.state.servicedRequest !== null ? ` (Req ${pt.snap.state.servicedRequest})` : ''}
                  </text>
                </g>
              `;
            }).join('')}
          </svg>
        </div>
      </div>
    `;
  }
}
