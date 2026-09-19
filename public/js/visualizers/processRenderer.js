/**
 * Process Management Visualizer
 * Pure rendering functions for 5-State lanes, PCB Inspector card, and Queue pills.
 */

import { getProcessColor } from './ganttRenderer.js';

export class ProcessRenderer {
  /**
   * Render the 5-State lifecycle board.
   * @param {HTMLElement} container
   * @param {Object} snapshot
   * @param {Function} onSelectProcess
   * @param {string|null} selectedProcessId
   */
  static renderStateBoard(container, snapshot, onSelectProcess, selectedProcessId) {
    if (!container || !snapshot || !snapshot.state) return;

    const states = [
      { id: 'NEW', label: '1. New', class: 'state-lane-new' },
      { id: 'READY', label: '2. Ready', class: 'state-lane-ready' },
      { id: 'RUNNING', label: '3. Running', class: 'state-lane-running' },
      { id: 'WAITING', label: '4. Waiting (I/O)', class: 'state-lane-waiting' },
      { id: 'TERMINATED', label: '5. Terminated', class: 'state-lane-terminated' }
    ];

    const processesByState = {
      NEW: [],
      READY: [],
      RUNNING: [],
      WAITING: [],
      TERMINATED: []
    };

    for (const p of snapshot.state.processes) {
      if (processesByState[p.state]) {
        processesByState[p.state].push(p);
      }
    }

    container.innerHTML = `
      <div class="state-lanes-grid">
        ${states.map(s => {
          const procs = processesByState[s.id] || [];
          return `
            <div class="state-lane ${s.class}">
              <div class="state-lane-header">
                <span>${s.label}</span>
                <span class="badge badge-secondary" style="font-size: 0.65rem;">${procs.length}</span>
              </div>
              <div class="state-lane-body" data-state="${s.id}">
                ${procs.length === 0 ? `
                  <div style="color: var(--text-muted); font-size: var(--text-xs); text-align: center; margin: auto;">
                    Empty
                  </div>
                ` : procs.map(p => `
                  <div class="state-process-chip ${selectedProcessId === p.id ? 'active' : ''}" data-process-id="${p.id}">
                    <div style="display: flex; align-items: center; gap: var(--space-2);">
                      <span class="process-badge" style="background-color: ${getProcessColor(p.id)};">
                        ${p.id}
                      </span>
                      <div>
                        <div class="state-process-chip-id">PID: ${p.pid}</div>
                        <div class="state-process-chip-sub">PC: 0x${p.programCounter.toString(16).toUpperCase().padStart(4, '0')}</div>
                      </div>
                    </div>
                    <div style="text-align: right;">
                      <span class="badge ${p.remainingTime === 0 ? 'badge-success' : 'badge-primary'}" style="font-size: 0.65rem;">
                        ${p.remainingTime} left
                      </span>
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Bind process chip clicks
    if (typeof onSelectProcess === 'function') {
      container.querySelectorAll('.state-process-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const pid = chip.dataset.processId;
          onSelectProcess(pid);
        });
      });
    }
  }

  /**
   * Render the PCB Inspector card.
   * @param {HTMLElement} container
   * @param {Object} pcb
   */
  static renderPcbInspector(container, pcb) {
    if (!container) return;

    if (!pcb) {
      container.innerHTML = `
        <div style="color: var(--text-muted); font-size: var(--text-sm); text-align: center; padding: var(--space-8);">
          Select a process to inspect its Process Control Block (PCB).
        </div>
      `;
      return;
    }

    const stateColors = {
      NEW: 'badge-secondary',
      READY: 'badge-primary',
      RUNNING: 'badge-success',
      WAITING: 'badge-warning',
      TERMINATED: 'badge-info'
    };

    const stateBadgeClass = stateColors[pcb.state] || 'badge-secondary';

    container.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3);">
        <div style="display: flex; align-items: center; gap: var(--space-2);">
          <span class="process-badge" style="background-color: ${getProcessColor(pcb.id)}; font-size: var(--text-sm);">
            ${pcb.id}
          </span>
          <h4 style="font-weight: 700; margin: 0; font-size: var(--text-base);">Process Control Block (PCB)</h4>
        </div>
        <span class="badge ${stateBadgeClass}">${pcb.state}</span>
      </div>

      <div class="pcb-grid">
        <div class="pcb-field">
          <span class="pcb-label">Process ID (PID)</span>
          <span class="pcb-value">${pcb.pid}</span>
        </div>
        <div class="pcb-field">
          <span class="pcb-label">Parent PID (PPID)</span>
          <span class="pcb-value">${pcb.parentPid}</span>
        </div>
        <div class="pcb-field">
          <span class="pcb-label">Program Counter (PC)</span>
          <span class="pcb-value">0x${pcb.programCounter.toString(16).toUpperCase().padStart(4, '0')}</span>
        </div>

        <div class="pcb-field">
          <span class="pcb-label">Register AX (Accumulator)</span>
          <span class="pcb-value">${pcb.registers?.AX ?? 0}</span>
        </div>
        <div class="pcb-field">
          <span class="pcb-label">Register BX (Base)</span>
          <span class="pcb-value">${pcb.registers?.BX ?? 0}</span>
        </div>
        <div class="pcb-field">
          <span class="pcb-label">Register IP (Instruction)</span>
          <span class="pcb-value">0x${(pcb.registers?.IP ?? 0).toString(16).toUpperCase().padStart(4, '0')}</span>
        </div>

        <div class="pcb-field">
          <span class="pcb-label">Arrival Time</span>
          <span class="pcb-value">${pcb.arrivalTime}</span>
        </div>
        <div class="pcb-field">
          <span class="pcb-label">Burst Time (Total)</span>
          <span class="pcb-value">${pcb.burstTime}</span>
        </div>
        <div class="pcb-field">
          <span class="pcb-label">Remaining CPU Time</span>
          <span class="pcb-value" style="color: ${pcb.remainingTime === 0 ? 'var(--accent-success)' : 'var(--accent-primary)'};">
            ${pcb.remainingTime}
          </span>
        </div>

        <div class="pcb-field">
          <span class="pcb-label">Priority Level</span>
          <span class="pcb-value">${pcb.priority}</span>
        </div>
        <div class="pcb-field" style="grid-column: span 2;">
          <span class="pcb-label">I/O Bursts</span>
          <span class="pcb-value" style="font-size: var(--text-xs); font-weight: normal; margin-top: var(--space-1);">
            ${pcb.ioBursts && pcb.ioBursts.length > 0
              ? pcb.ioBursts.map(io => `Start: ${io.start}, Dur: ${io.duration} (${io.remainingDuration} left)`).join(' | ')
              : 'None'}
          </span>
        </div>
      </div>
    `;
  }

  /**
   * Render Ready and Waiting Queues.
   * @param {HTMLElement} readyEl
   * @param {HTMLElement} waitingEl
   * @param {Object} snapshot
   */
  static renderQueues(readyEl, waitingEl, snapshot) {
    if (!snapshot || !snapshot.state) return;

    if (readyEl) {
      if (snapshot.state.readyQueue.length > 0) {
        readyEl.innerHTML = snapshot.state.readyQueue.map((id, idx) => `
          <span class="process-badge" style="background-color: ${getProcessColor(id)};">
            ${id}
          </span>
          ${idx < snapshot.state.readyQueue.length - 1 ? '<span class="queue-arrow">➔</span>' : ''}
        `).join('');
      } else {
        readyEl.innerHTML = `<span style="color: var(--text-muted); font-size: var(--text-xs);">Empty</span>`;
      }
    }

    if (waitingEl) {
      if (snapshot.state.waitingQueue.length > 0) {
        waitingEl.innerHTML = snapshot.state.waitingQueue.map((id, idx) => {
          const proc = snapshot.state.processes.find(p => p.id === id);
          const activeIo = proc?.ioBursts?.find(io => !io.completed && io.remainingDuration > 0);
          const rem = activeIo ? `${activeIo.remainingDuration}t` : '';

          return `
            <div style="display: inline-flex; align-items: center; gap: 4px;">
              <span class="process-badge" style="background-color: ${getProcessColor(id)};">
                ${id}
              </span>
              ${rem ? `<span class="badge badge-warning" style="font-size: 0.65rem;">${rem}</span>` : ''}
            </div>
            ${idx < snapshot.state.waitingQueue.length - 1 ? '<span class="queue-arrow">➔</span>' : ''}
          `;
        }).join('');
      } else {
        waitingEl.innerHTML = `<span style="color: var(--text-muted); font-size: var(--text-xs);">Empty</span>`;
      }
    }
  }
}
