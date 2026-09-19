/**
 * Memory Management Visualizer
 * Pure rendering functions for Memory Allocation layouts and Page Replacement matrix tables.
 */

import { getProcessColor } from './ganttRenderer.js';

export class MemoryRenderer {
  /**
   * Render contiguous memory partitions with internal fragmentation.
   * @param {HTMLElement} container
   * @param {Object} snapshot
   */
  static renderAllocationLayout(container, snapshot) {
    if (!container || !snapshot || !snapshot.state) return;

    const { blocks, processes } = snapshot.state;
    const totalMemory = blocks.reduce((sum, b) => sum + b.size, 0);

    container.innerHTML = `
      <div class="memory-map-wrapper">
        <div class="memory-map-title">Physical Memory Allocation Map (Total: ${totalMemory} KB)</div>
        <div class="memory-blocks-track">
          ${blocks.map(b => {
            const blockWidthPercent = Math.max(12, Math.round((b.size / totalMemory) * 100));
            const isAllocated = !b.isFree;
            const processPercent = isAllocated && b.size > 0
              ? Math.round((b.allocatedProcessSize / b.size) * 100)
              : 0;
            const fragPercent = 100 - processPercent;

            return `
              <div class="memory-block-card ${isAllocated ? 'allocated' : 'free'}" style="flex: ${b.size}; min-width: 130px;">
                <div class="memory-block-header">
                  <span class="memory-block-id">${b.id}</span>
                  <span class="memory-block-size">${b.size} KB</span>
                </div>

                <div class="memory-block-body">
                  ${isAllocated ? `
                    <div class="block-bar-container">
                      <div class="block-bar-used" style="width: ${processPercent}%; background-color: ${getProcessColor(b.allocatedProcessId)};" title="${b.allocatedProcessId}: ${b.allocatedProcessSize} KB">
                        <span class="block-proc-label">${b.allocatedProcessId} (${b.allocatedProcessSize}K)</span>
                      </div>
                      ${b.internalFragmentation > 0 ? `
                        <div class="block-bar-frag" style="width: ${fragPercent}%;" title="Internal Frag: ${b.internalFragmentation} KB">
                          <span class="block-frag-label">Frag ${b.internalFragmentation}K</span>
                        </div>
                      ` : ''}
                    </div>
                  ` : `
                    <div class="block-bar-free">
                      <span>FREE</span>
                    </div>
                  `}
                </div>

                <div class="memory-block-footer">
                  ${isAllocated
                    ? `<span class="badge badge-success">Allocated: ${b.allocatedProcessId}</span>`
                    : `<span class="badge badge-secondary">Available</span>`}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Process Requests Queue / Status -->
      <div class="memory-processes-status">
        <div class="memory-map-title">Process Requests & Status</div>
        <div class="process-chip-row">
          ${processes.map(p => {
            let statusBadge = '<span class="badge badge-secondary">Pending</span>';
            if (p.status === 'allocated') {
              statusBadge = `<span class="badge badge-success">Block ${p.allocatedBlockId}</span>`;
            } else if (p.status === 'failed') {
              statusBadge = '<span class="badge badge-danger">Failed</span>';
            }

            return `
              <div class="process-status-chip ${p.status}">
                <div style="display: flex; align-items: center; gap: var(--space-2);">
                  <span class="process-badge" style="background-color: ${getProcessColor(p.id)};">
                    ${p.id}
                  </span>
                  <span style="font-weight: 600; font-size: var(--text-xs);">${p.size} KB</span>
                </div>
                <div>${statusBadge}</div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render Page Replacement 2D matrix / table.
   * @param {HTMLElement} container
   * @param {Array<Object>} snapshots - All timeline snapshots
   * @param {number} currentStepIndex - Active step in playback
   */
  static renderPageReplacementTimeline(container, snapshots, currentStepIndex) {
    if (!container || !snapshots || snapshots.length === 0) return;

    // Filter to execution snapshots (stepIndex >= 1)
    const execSnapshots = snapshots.filter(s => s.stepIndex > 0);
    if (execSnapshots.length === 0) return;

    const frameCount = execSnapshots[0].state.frames.length;

    container.innerHTML = `
      <div class="pr-matrix-wrapper">
        <table class="pr-matrix-table">
          <thead>
            <tr>
              <th class="pr-header-label">Reference</th>
              ${execSnapshots.map((s, idx) => `
                <th class="pr-ref-cell ${idx + 1 === currentStepIndex ? 'active-step' : ''}">
                  <span class="pr-ref-badge">${s.state.reference}</span>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            ${Array.from({ length: frameCount }, (_, frameIdx) => `
              <tr>
                <td class="pr-frame-label">Frame ${frameIdx}</td>
                ${execSnapshots.map((s, idx) => {
                  const frame = s.state.frames[frameIdx];
                  const isModified = s.state.frameIndexModified === frameIdx && idx + 1 <= currentStepIndex;
                  const isCurrent = idx + 1 === currentStepIndex;
                  const isPastOrCurrent = idx + 1 <= currentStepIndex;

                  const pageValue = isPastOrCurrent ? (frame?.page ?? '-') : '-';
                  let cellClass = '';
                  if (isCurrent && isModified) {
                    cellClass = s.state.isHit ? 'cell-hit' : 'cell-fault';
                  }

                  return `
                    <td class="pr-frame-cell ${isCurrent ? 'active-col' : ''} ${cellClass}">
                      <span class="pr-page-slot">${pageValue}</span>
                    </td>
                  `;
                }).join('')}
              </tr>
            `).join('')}
            <!-- Hit/Fault Status Row -->
            <tr class="pr-status-row">
              <td class="pr-status-label">Result</td>
              ${execSnapshots.map((s, idx) => {
                const isPastOrCurrent = idx + 1 <= currentStepIndex;
                const isCurrent = idx + 1 === currentStepIndex;

                if (!isPastOrCurrent) {
                  return `<td class="pr-status-cell ${isCurrent ? 'active-col' : ''}">-</td>`;
                }

                return `
                  <td class="pr-status-cell ${isCurrent ? 'active-col' : ''}">
                    ${s.state.isHit
                      ? '<span class="badge badge-success pr-status-badge">HIT</span>'
                      : `<span class="badge badge-danger pr-status-badge">FAULT</span>`}
                  </td>
                `;
              }).join('')}
            </tr>
          </tbody>
        </table>
      </div>
    `;
  }
}
