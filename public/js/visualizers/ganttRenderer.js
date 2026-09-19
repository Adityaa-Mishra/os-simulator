/**
 * GanttRenderer
 * Visualizes CPU execution timelines, process burst intervals,
 * and idle periods as a clean, interactive Gantt chart.
 */

// Deterministic color palette generator for process IDs
export function getProcessColor(processId) {
  if (!processId || processId === 'IDLE') {
    return 'var(--bg-tertiary)';
  }

  // Generate consistent hue based on process ID string
  let hash = 0;
  for (let i = 0; i < processId.length; i++) {
    hash = (hash << 5) - hash + processId.charCodeAt(i);
    hash |= 0;
  }

  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 45%)`;
}

export class GanttRenderer {
  /**
   * Render the Gantt chart into the target container.
   * @param {HTMLElement} container - DOM container element
   * @param {Array<{ processId: string|null, start: number, end: number }>} ganttData
   * @param {number} totalTime - Total timeline duration
   */
  static render(container, ganttData = [], totalTime = 1) {
    if (!container) return;

    if (!Array.isArray(ganttData) || ganttData.length === 0 || totalTime <= 0) {
      container.innerHTML = `
        <div style="padding: var(--space-6); text-align: center; color: var(--text-muted);">
          No execution data to display.
        </div>
      `;
      return;
    }

    // Build timeline blocks
    let blocksHtml = '';
    for (const block of ganttData) {
      const duration = block.end - block.start;
      const widthPct = (duration / totalTime) * 100;
      const isIdle = block.processId === null;
      const label = isIdle ? 'IDLE' : block.processId;
      const bgColor = isIdle ? '' : getProcessColor(block.processId);
      const customClass = isIdle ? 'gantt-block gantt-block-idle' : 'gantt-block';

      blocksHtml += `
        <div class="${customClass}"
             style="width: ${widthPct}%; ${!isIdle ? `background-color: ${bgColor};` : ''}"
             title="${label} [${block.start} - ${block.end}] (${duration} units)">
          <span>${label}</span>
          <span style="font-size: 0.65rem; opacity: 0.85;">${block.start}→${block.end}</span>
        </div>
      `;
    }

    // Build time tick markers
    let ticksHtml = '';
    const uniquePoints = new Set([0]);
    for (const b of ganttData) {
      uniquePoints.add(b.start);
      uniquePoints.add(b.end);
    }
    const sortedPoints = Array.from(uniquePoints).sort((a, b) => a - b);

    for (const point of sortedPoints) {
      const leftPct = (point / totalTime) * 100;
      ticksHtml += `
        <span class="gantt-tick" style="left: ${leftPct}%;">${point}</span>
      `;
    }

    container.innerHTML = `
      <div class="gantt-container">
        <div class="gantt-track" id="gantt-track-bar">
          ${blocksHtml}
          <div class="gantt-cursor" id="gantt-cursor-line" style="left: 0%; display: none;"></div>
        </div>
        <div class="gantt-time-scale">
          ${ticksHtml}
        </div>
      </div>
    `;
  }

  /**
   * Update playback cursor position on the Gantt chart.
   * @param {HTMLElement} container
   * @param {number} currentTime
   * @param {number} totalTime
   */
  static updateCursor(container, currentTime, totalTime) {
    if (!container || totalTime <= 0) return;

    const cursor = container.querySelector('#gantt-cursor-line');
    if (cursor) {
      cursor.style.display = 'block';
      const pct = Math.min(100, Math.max(0, (currentTime / totalTime) * 100));
      cursor.style.left = `${pct}%`;
    }
  }
}
