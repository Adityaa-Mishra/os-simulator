/**
 * FileSystemRenderer
 * Pure rendering functions for:
 * 1. Interactive Virtual File System (VFS) Tree with icons, badges, and node selection.
 * 2. 32-block Disk Map with contiguous allocation layout and external fragmentation indicators.
 * 3. Node metadata inspector card.
 */

export class FileSystemRenderer {
  /**
   * Render virtual filesystem tree hierarchy.
   * @param {HTMLElement} container
   * @param {Array<Object>} nodes - List of node objects
   * @param {string|null} activeNodeId - ID of currently selected node
   * @param {Function|null} onSelectNode - Selection callback
   */
  static renderTree(container, nodes, activeNodeId = null, onSelectNode = null) {
    if (!container || !Array.isArray(nodes)) return;

    // Build parent-to-children mapping
    const nodeMap = new Map();
    const childrenMap = new Map();

    nodes.forEach(n => {
      nodeMap.set(n.id, n);
      childrenMap.set(n.id, []);
    });

    let root = null;
    nodes.forEach(n => {
      if (n.parentId === null || n.id === 'root') {
        root = n;
      } else if (childrenMap.has(n.parentId)) {
        childrenMap.get(n.parentId).push(n);
      }
    });

    // Helper to render tree nodes recursively
    function buildNodeHtml(node, depth = 0) {
      const isDir = node.type === 'directory';
      const isRoot = node.id === 'root';
      const isSelected = node.id === activeNodeId;
      const children = childrenMap.get(node.id) || [];

      // Sort children: directories first, then alphabetical
      children.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });

      const icon = isRoot ? '\uD83D\uDDA5\uFE0F' : (isDir ? '\uD83D\uDCC1' : '\uD83D\uDCC4');
      const openBadge = node.type === 'file'
        ? (node.open
          ? '<span class="vfs-badge vfs-open" title="File is currently open">\uD83D\uDD13 OPEN</span>'
          : '<span class="vfs-badge vfs-closed" title="File is closed">\uD83D\uDD12 CLOSED</span>')
        : '';
      const sizeBadge = node.type === 'file'
        ? `<span class="vfs-badge vfs-size">${node.size}B</span>`
        : '';
      const blocksBadge = node.type === 'file' && Array.isArray(node.blocks) && node.blocks.length > 0
        ? `<span class="vfs-badge vfs-blocks" title="Allocated Blocks">B[${node.blocks.join(',')}]</span>`
        : '';
      const permBadge = `<span class="vfs-badge vfs-perm">${node.permissions}</span>`;

      let html = `
        <div class="vfs-tree-row ${isSelected ? 'selected' : ''}" data-node-id="${node.id}" style="padding-left: ${depth * 20}px;">
          <span class="vfs-icon">${icon}</span>
          <span class="vfs-name ${isDir ? 'vfs-dirname' : 'vfs-filename'}">${node.name}</span>
          <div class="vfs-badges">
            ${permBadge}
            ${sizeBadge}
            ${blocksBadge}
            ${openBadge}
          </div>
        </div>
      `;

      if (children.length > 0) {
        html += '<div class="vfs-children">';
        for (const child of children) {
          html += buildNodeHtml(child, depth + 1);
        }
        html += '</div>';
      }

      return html;
    }

    container.innerHTML = `
      <div class="vfs-tree-card">
        <div class="vfs-tree-header">
          <span class="vfs-tree-title">Virtual Directory Hierarchy</span>
          <span class="vfs-node-count">${nodes.length} nodes</span>
        </div>
        <div class="vfs-tree-body">
          ${root ? buildNodeHtml(root, 0) : '<div class="empty-tree">No nodes found.</div>'}
        </div>
      </div>
    `;

    // Bind click events for node selection
    if (typeof onSelectNode === 'function') {
      const rows = container.querySelectorAll('.vfs-tree-row');
      rows.forEach(row => {
        row.addEventListener('click', () => {
          const nodeId = row.dataset.nodeId;
          const node = nodeMap.get(nodeId);
          if (node) {
            rows.forEach(r => r.classList.remove('selected'));
            row.classList.add('selected');
            onSelectNode(node);
          }
        });
      });
    }
  }

  /**
   * Render 32-block disk layout with allocation indicators and external fragmentation.
   * @param {HTMLElement} container
   * @param {Array<Object>} blockMap - List of { block, status, fileId }
   * @param {Array<Object>} nodes - Node list for file name lookup
   * @param {Object} options
   */
  static renderBlockMap(container, blockMap, nodes = [], options = {}) {
    if (!container || !Array.isArray(blockMap)) return;

    // Map fileId -> file object
    const fileMap = new Map();
    nodes.forEach(n => {
      if (n.type === 'file') fileMap.set(n.id, n);
    });

    let allocated = 0;
    let free = 0;
    let largestContiguous = 0;
    let currentContiguous = 0;

    for (let i = 0; i < blockMap.length; i++) {
      if (blockMap[i].status === 'allocated') {
        allocated++;
        currentContiguous = 0;
      } else {
        free++;
        currentContiguous++;
        if (currentContiguous > largestContiguous) {
          largestContiguous = currentContiguous;
        }
      }
    }

    const externalFrag = free - largestContiguous;
    const total = blockMap.length;
    const utilization = total > 0 ? ((allocated / total) * 100).toFixed(1) : 0;

    container.innerHTML = `
      <div class="disk-block-card">
        <div class="disk-block-header">
          <div>
            <span class="block-card-title">Physical Disk Blocks (Contiguous Allocation)</span>
            <span class="block-card-subtitle">32 Blocks \u00D7 64 Bytes = 2,048 Bytes Total</span>
          </div>
          <div class="disk-metrics-pills">
            <span class="disk-pill"><span class="pill-lbl">Allocated:</span> <strong>${allocated} / ${total} (${utilization}%)</strong></span>
            <span class="disk-pill"><span class="pill-lbl">Free:</span> <strong style="color: #10b981;">${free}</strong></span>
            <span class="disk-pill" title="Longest consecutive sequence of free blocks"><span class="pill-lbl">Max Contiguous:</span> <strong style="color: #3b82f6;">${largestContiguous}</strong></span>
            ${externalFrag > 0 ? `
              <span class="disk-pill pill-frag" title="Free blocks isolated by other files and cannot be used together"><span class="pill-lbl">External Frag:</span> <strong style="color: #ef4444;">${externalFrag} blocks</strong></span>
            ` : ''}
          </div>
        </div>

        <!-- Block Grid -->
        <div class="disk-block-grid">
          ${blockMap.map(b => {
            const isAlloc = b.status === 'allocated';
            const file = isAlloc ? fileMap.get(b.fileId) : null;
            const fileName = file ? file.name : (b.fileId || '');
            const highlightClass = options.highlightFileId === b.fileId ? 'highlight-block' : '';

            return `
              <div class="disk-block-tile ${isAlloc ? 'block-allocated' : 'block-free'} ${highlightClass}"
                   title="Block ${b.block}: ${isAlloc ? `Allocated to ${fileName}` : 'FREE'}">
                <span class="block-num">${b.block}</span>
                <span class="block-status">${isAlloc ? 'OCCUPIED' : 'FREE'}</span>
                <span class="block-owner">${isAlloc ? fileName : '\u2014'}</span>
              </div>
            `;
          }).join('')}
        </div>

        <!-- Legend -->
        <div class="disk-block-legend">
          <div class="legend-item"><span class="legend-box free"></span> Free Block</div>
          <div class="legend-item"><span class="legend-box allocated"></span> Allocated (Contiguous)</div>
          ${externalFrag > 0 ? `
            <div class="frag-alert">
              \u26A0\uFE0F <strong>External Fragmentation Alert:</strong> ${free} free blocks exist in total, but the largest contiguous allocation possible is only ${largestContiguous} blocks. Any file requiring > ${largestContiguous} blocks will fail to allocate!
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Render node details metadata card.
   */
  static renderNodeDetails(container, node) {
    if (!container) return;

    if (!node) {
      container.innerHTML = `
        <div class="vfs-details-card empty">
          <span style="color: var(--text-muted); font-size: var(--text-xs);">Select a file or directory from the tree to inspect its metadata.</span>
        </div>
      `;
      return;
    }

    const isFile = node.type === 'file';

    container.innerHTML = `
      <div class="vfs-details-card">
        <div class="vfs-details-header">
          <span class="details-title">${isFile ? '\uD83D\uDCC4 File Metadata' : '\uD83D\uDCC1 Directory Metadata'}</span>
          <span class="vfs-badge ${isFile ? 'vfs-filename' : 'vfs-dirname'}">${node.type.toUpperCase()}</span>
        </div>
        <div class="vfs-details-grid">
          <div class="detail-row"><span class="detail-lbl">Name:</span> <strong class="detail-val">${node.name}</strong></div>
          <div class="detail-row"><span class="detail-lbl">Node ID:</span> <span class="detail-val font-mono">${node.id}</span></div>
          <div class="detail-row"><span class="detail-lbl">Parent ID:</span> <span class="detail-val font-mono">${node.parentId || 'None (Root)'}</span></div>
          <div class="detail-row"><span class="detail-lbl">Permissions:</span> <span class="detail-val font-mono">${node.permissions}</span></div>
          ${isFile ? `
            <div class="detail-row"><span class="detail-lbl">Size:</span> <span class="detail-val font-mono">${node.size} Bytes (${node.blocks.length} blocks)</span></div>
            <div class="detail-row"><span class="detail-lbl">Allocated Blocks:</span> <span class="detail-val font-mono">[${node.blocks.join(', ')}]</span></div>
            <div class="detail-row"><span class="detail-lbl">Open Status:</span> <span class="detail-val">${node.open ? '<strong style="color: #10b981;">OPEN (\uD83D\uDD13)</strong>' : '<span style="color: var(--text-muted);">CLOSED (\uD83D\uDD12)</span>'}</span></div>
            <div class="detail-row"><span class="detail-lbl">Modified At:</span> <span class="detail-val font-mono">Tick ${node.modifiedAt}</span></div>
          ` : `
            <div class="detail-row"><span class="detail-lbl">Created At:</span> <span class="detail-val font-mono">Tick ${node.createdAt}</span></div>
          `}
        </div>
      </div>
    `;
  }
}
