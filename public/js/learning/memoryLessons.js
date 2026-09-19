/**
 * Memory Management Learning Module Content
 * Educational concepts, worked examples, key terms, quiz, and simulator presets.
 */

export const memoryLessons = {
  id: 'memory',
  title: 'Memory Management',
  description: 'Understand physical and virtual memory systems, fixed partition allocation algorithms (First Fit, Best Fit, Worst Fit), internal/external fragmentation, and virtual paging replacement policies (FIFO, LRU, Optimal).',
  icon: '💾',
  simulatorRoute: '#/memory',
  objectives: [
    'Distinguish between physical contiguous allocation (fixed partitions) and virtual non-contiguous paging.',
    'Identify and calculate internal fragmentation and external fragmentation.',
    'Compare contiguous placement algorithms: First Fit, Best Fit, and Worst Fit.',
    'Understand virtual memory paging, page tables, page faults, and physical frames.',
    'Trace and compare page replacement algorithms: FIFO, LRU, and Optimal on realistic reference strings.',
    'Recognize Belady\'s Anomaly in FIFO page replacement.'
  ],
  concepts: [
    {
      id: 'allocation-systems',
      title: 'Memory Architecture: Partitions vs. Paging',
      content: `
Memory management in operating systems bridges two distinct paradigms:

1. **Fixed Partition Contiguous Allocation**:
   - Physical RAM is divided into a fixed number of predetermined static partitions (e.g., 100 KB, 500 KB, 200 KB, 300 KB).
   - Each partition can hold at most **one process** at a time.
   - When a process terminates, its partition becomes available for another process.
   - *Note on this Simulator*: The current simulator implements **Fixed Partition Allocation** (with First Fit, Best Fit, and Worst Fit) and does not model dynamic variable partitioning.

2. **Virtual Memory & Paging (Non-Contiguous)**:
   - Physical memory is broken down into fixed-sized blocks called **Frames** (e.g., 4 KB).
   - Logical process memory is divided into blocks of the exact same size called **Pages**.
   - The OS **Page Table** maps logical pages to physical frames, allowing a process to reside non-contiguously anywhere in physical RAM.
      `
    },
    {
      id: 'fragmentation',
      title: 'Internal vs. External Fragmentation',
      content: `
Fragmentation is wasted memory space that cannot be utilized:

- **Internal Fragmentation**:
  - Occurs when allocated memory is slightly larger than the requested memory.
  - The unused portion inside the allocated partition or page is wasted.
  - *Example*: A process requests $180\\text{ KB}$ and is placed in a fixed partition of $200\\text{ KB}$. The remaining $20\\text{ KB}$ is internal fragmentation that no other process can use.

- **External Fragmentation**:
  - Occurs when there is enough total free memory space in the system to satisfy a request, but the available space is fragmented into separate, non-contiguous holes.
  - *Mitigation in Paging*: Paging virtually eliminates external fragmentation because any free page frame can be allocated to any process page regardless of location.
      `
    },
    {
      id: 'partition-algorithms',
      title: 'Fixed Partition Placement Strategies',
      content: `
When a process arrives and multiple free partitions can accommodate it, the OS uses a placement strategy:

1. **First Fit**:
   - Scans the partition list from the beginning and allocates the **first** partition that is large enough ($PartitionSize \\ge ProcessSize$).
   - *Advantage*: Fastest allocation time.

2. **Best Fit**:
   - Searches the entire list and allocates the **smallest** partition that is large enough.
   - *Advantage*: Leaves the smallest leftover hole in the partition.
   - *Disadvantage*: Must search the entire list (unless sorted), and can produce tiny, unusable fragments.

3. **Worst Fit**:
   - Searches the entire list and allocates the **largest** available partition.
   - *Rationale*: Leaves the largest possible leftover space, which in dynamic systems might be large enough to hold another process.
      `
    },
    {
      id: 'page-replacement',
      title: 'Page Faults & Page Replacement Policies',
      content: `
### Page Faults
When a process references a page that is not currently present in physical RAM, the Memory Management Unit (MMU) generates a hardware trap called a **Page Fault**. The OS must:
1. Locate the requested page on backing swap storage.
2. Find an empty frame in physical memory.
3. If no frame is free, select a **victim frame** using a **Page Replacement Algorithm** and write it to swap if modified (dirty).
4. Read the requested page into the freed frame, update the page table, and restart the trapped instruction.

### Page Replacement Algorithms
- **FIFO (First-In, First-Out)**: Replaces the page that has been in memory the longest. Simple, but suffers from **Belady's Anomaly** (increasing frame count can sometimes increase page faults).
- **LRU (Least Recently Used)**: Replaces the page that has not been accessed for the longest period of time. Approximates optimal replacement by looking at past behavior.
- **Optimal (OPT / MIN)**: Replaces the page that will not be used for the longest period of time in the future. Provably produces the lowest possible page fault rate, but cannot be implemented in general-purpose operating systems because it requires perfect future knowledge (used as an analytical benchmark).
      `
    }
  ],
  workedExample: {
    title: 'Worked Example: LRU Page Replacement (3 Frames)',
    description: 'Trace the reference string [7, 0, 1, 2, 0, 3, 0, 4, 2, 3] with 3 physical memory frames:',
    table: [
      { step: 1, ref: '7', frames: '[7, -, -]', fault: 'Yes (Fault)', reason: 'Frame 0 allocated' },
      { step: 2, ref: '0', frames: '[7, 0, -]', fault: 'Yes (Fault)', reason: 'Frame 1 allocated' },
      { step: 3, ref: '1', frames: '[7, 0, 1]', fault: 'Yes (Fault)', reason: 'Frame 2 allocated' },
      { step: 4, ref: '2', frames: '[2, 0, 1]', fault: 'Yes (Fault)', reason: '7 was least recently used (replaced)' },
      { step: 5, ref: '0', frames: '[2, 0, 1]', fault: 'No (Hit)', reason: '0 is already in Frame 1' },
      { step: 6, ref: '3', frames: '[2, 0, 3]', fault: 'Yes (Fault)', reason: '1 was least recently used (replaced)' },
      { step: 7, ref: '0', frames: '[2, 0, 3]', fault: 'No (Hit)', reason: '0 is already in Frame 1' },
      { step: 8, ref: '4', frames: '[4, 0, 3]', fault: 'Yes (Fault)', reason: '2 was least recently used (replaced)' },
      { step: 9, ref: '2', frames: '[4, 0, 2]', fault: 'Yes (Fault)', reason: '3 was least recently used (replaced)' },
      { step: 10, ref: '3', frames: '[4, 3, 2]', fault: 'Yes (Fault)', reason: '0 was least recently used (replaced)' }
    ],
    walkthrough: `
- **Total References**: 10
- **Total Page Faults**: 8
- **Total Hits**: 2
- **Hit Ratio**: $2 / 10 = 20\\%$
- **Fault Rate**: $8 / 10 = 80\\%$
- Notice how on Step 5, referencing \`0\` refreshed its recency. When Step 6 needed to replace a page, \`1\` was chosen because \`1\` was accessed at Step 3, whereas \`0\` was accessed at Step 5.
    `,
    sampleInputs: {
      algorithm: 'memory_lru',
      inputs: {
        pages: [7, 0, 1, 2, 0, 3, 0, 4, 2, 3],
        frameCount: 3
      }
    }
  },
  keyTerms: [
    { term: 'Internal Fragmentation', definition: 'Unused memory within an allocated partition or page frame.' },
    { term: 'External Fragmentation', definition: 'Total memory space exists to satisfy a request, but it is not contiguous.' },
    { term: 'Page Fault', definition: 'A trap raised by hardware when a program accesses a page that is mapped in virtual address space, but not loaded in physical RAM.' },
    { term: 'Frame', definition: 'A fixed-size block of physical memory that holds a single virtual memory page.' },
    { term: 'Belady\'s Anomaly', definition: 'The counterintuitive phenomenon where increasing the number of page frames results in an increase in the number of page faults for certain reference strings under FIFO.' },
    { term: 'Least Recently Used (LRU)', definition: 'A page replacement policy that evicts the page whose last memory access occurred furthest in the past.' }
  ],
  quiz: [
    {
      id: 'q1',
      question: 'What is internal fragmentation?',
      options: [
        'Memory that is completely unallocated across the entire RAM',
        'Unused memory space located inside an allocated partition or page',
        'Physical hard drive sectors that have corrupted metadata',
        'Page tables exceeding the maximum allowed size in kernel memory'
      ],
      correctAnswer: 1,
      explanation: 'Internal fragmentation is the wasted memory that results when a process is allocated a fixed partition or page frame that is larger than the memory it actually needs.'
    },
    {
      id: 'q2',
      question: 'In fixed partition memory allocation, which algorithm allocates the smallest partition that is large enough to hold the process?',
      options: [
        'First Fit',
        'Best Fit',
        'Worst Fit',
        'Next Fit'
      ],
      correctAnswer: 1,
      explanation: 'Best Fit searches all available partitions and selects the one whose size is closest to (but at least as large as) the requested size, minimizing the immediate internal fragment.'
    },
    {
      id: 'q3',
      question: 'How does virtual memory paging eliminate external fragmentation?',
      options: [
        'By compressing all data before saving it to disk',
        'By allowing a process\'s logical address space to be mapped into non-contiguous physical frames',
        'By increasing the size of physical RAM to infinity',
        'By preventing processes from using more than 1 MB of memory'
      ],
      correctAnswer: 1,
      explanation: 'Because physical memory is divided into fixed-size frames and any virtual page can fit into any available physical frame, there is no requirement for physical memory to be contiguous, eliminating external fragmentation.'
    },
    {
      id: 'q4',
      question: 'What is Belady\'s Anomaly?',
      options: [
        'A memory leak that causes the operating system to shut down',
        'A scenario where increasing the number of physical frames increases the number of page faults under FIFO',
        'An error where LRU replacement selects the most recently used page instead of the least recently used',
        'The CPU clock running faster than the bus speed'
      ],
      correctAnswer: 1,
      explanation: 'Belady\'s Anomaly is the surprising observation that for FIFO page replacement, adding more physical memory frames can actually result in more page faults for certain reference strings.'
    },
    {
      id: 'q5',
      question: 'Why is the Optimal (OPT) page replacement algorithm not practically implementable in general-purpose operating systems?',
      options: [
        'It requires too much physical RAM to calculate',
        'It requires impossible future knowledge of which pages will be referenced and when',
        'It can only be used on 32-bit hardware architectures',
        'It is patented by Silberschatz and cannot be used in open source'
      ],
      correctAnswer: 1,
      explanation: 'The Optimal algorithm replaces the page that will not be used for the longest period of time in the future. Because an OS cannot foresee future user and program actions, it can only serve as an analytical performance benchmark.'
    },
    {
      id: 'q6',
      question: 'What occurs when a CPU attempts to access a virtual memory address whose page table entry has the valid/invalid bit set to invalid?',
      options: [
        'The CPU immediately shuts down',
        'A Page Fault trap is generated, prompting the OS to fetch the page from disk',
        'The memory is automatically formatted',
        'The process is converted into a zombie process'
      ],
      correctAnswer: 1,
      explanation: 'An invalid bit indicates the page is currently in secondary swap storage rather than physical RAM. The MMU raises a Page Fault interrupt so the OS can load the page into memory.'
    },
    {
      id: 'q7',
      question: 'If a system has 10 page references with 4 page faults, what is the Hit Ratio?',
      options: [
        '40%',
        '60%',
        '25%',
        '100%'
      ],
      correctAnswer: 1,
      explanation: 'Number of hits = Total references (10) - Page faults (4) = 6 hits. Hit Ratio = 6 / 10 = 60%.'
    }
  ]
};
