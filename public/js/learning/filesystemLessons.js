/**
 * File System Learning Module Content
 * Educational concepts, worked examples, key terms, quiz, and simulator presets.
 */

export const filesystemLessons = {
  id: 'filesystem',
  title: 'File System Simulation',
  description: 'Explore hierarchical file systems, directory traversal, absolute vs. relative paths, contiguous First-Fit block allocation, external fragmentation, file open/close states, and permissions.',
  icon: '📁',
  simulatorRoute: '#/filesystem',
  objectives: [
    'Understand the organizational hierarchy of directories, subdirectories, and files.',
    'Differentiate between absolute paths (/a/b/c) and relative paths (../b).',
    'Examine contiguous block allocation and compare its advantages and disadvantages.',
    'Analyze external fragmentation resulting from file deletions and re-allocations on a block map.',
    'Trace the lifecycle of file descriptors through open(), read(), write(), and close() operations.',
    'Understand file permission modes (read, write, execute) and access enforcement.'
  ],
  concepts: [
    {
      id: 'vfs-architecture',
      title: 'Hierarchical VFS & In-Memory Simulation Note',
      content: `
### What is a File System?
A **File System** is an operating system subsystem that manages persistent structured storage. It provides a logical abstraction over raw secondary storage blocks, organizing bytes into human-readable **files** arranged within a tree of **directories**.

> [!IMPORTANT]
> **Educational Simulation Model Note**:
> The simulator in this platform is a **pure in-memory Virtual File System (VFS)** designed to illustrate core operating system file concepts (path resolution, block allocation, open-file tables, permissions). It does not interact with your physical operating system drive or disk hardware.

### Directory Hierarchy & Paths
- **Root Directory (\`/\`)**: The top of the tree hierarchy.
- **Absolute Path**: A path that begins from the root directory (e.g., \`/home/user/document.txt\`). It uniquely identifies a file from any working directory.
- **Relative Path**: A path evaluated relative to the process's **Current Working Directory (cwd)** (e.g., \`./data.csv\` or \`../notes.txt\`).
  - \`.\` refers to the current directory.
  - \`..\` refers to the parent directory.
      `
    },
    {
      id: 'block-allocation',
      title: 'Contiguous Block Allocation & Fragmentation',
      content: `
### Contiguous Allocation
In **contiguous allocation**, each file occupies a set of consecutive blocks on the simulated disk:
- *Directory Entry*: Stores the file name, starting block address, and file length in blocks.
- *Advantage*: Extremely fast sequential and direct access (minimal disk head seek movement required between consecutive blocks).
- *Disadvantages*:
  1. **External Fragmentation**: As files of varying lengths are created and deleted over time, free disk space is carved into scattered, non-contiguous holes. A file cannot be allocated even if total free blocks exceed its size, unless a single contiguous run of free blocks exists.
  2. **File Size Growth**: Difficult to expand a file in-place if the neighboring block is already allocated to another file.

### First-Fit Block Search
The simulator implements a **First-Fit contiguous allocator** on a 32-block disk map (each block = 512 bytes):
1. Calculates required blocks: $\\lceil \\text{FileSize} / \\text{BlockSize} \\rceil$.
2. Scans the 32-block array from block 0 upwards looking for the first contiguous run of free blocks that satisfies the required length.
3. If found, marks those blocks as allocated; if no contiguous run is large enough, throws an **External Fragmentation / Out of Space error**.
      `
    },
    {
      id: 'file-operations',
      title: 'File State, Permissions & System Calls',
      content: `
### Open-File Tables & State
Operating systems maintain two levels of open-file state:
- **System-Wide Open-File Table**: Tracks every file currently open anywhere in the OS, its current access count, and lock status.
- **Per-Process File-Descriptor Table**: Maps a process-specific integer (file descriptor) to the system-wide table entry, keeping track of the current **file read/write pointer offset**.

Files must be \`open()\`ed before \`read()\` or \`write()\` operations can occur, and should be \`close()\`ed when finished to flush buffers and release the descriptor.

### File Permissions
The simulator models standard permission flags:
- **Read (\`r\`)**: Allows viewing the content and attributes of a file, or listing directory entries.
- **Write (\`w\`)**: Allows creating, modifying, truncating, or appending data to a file.
- **Execute (\`x\`)**: Allows executing the file as a process, or entering/traversing a directory.
      `
    }
  ],
  workedExample: {
    title: 'Worked Example: Contiguous Block Allocation & External Fragmentation',
    description: 'Trace file allocations and deletions on a 32-block disk map (512 bytes per block):',
    table: [
      { step: 1, action: 'Create fileA.txt (1024 B)', blocksNeeded: 2, allocatedBlocks: '[0, 1]', status: 'Success' },
      { step: 2, action: 'Create fileB.txt (1536 B)', blocksNeeded: 3, allocatedBlocks: '[2, 3, 4]', status: 'Success' },
      { step: 3, action: 'Create fileC.txt (1024 B)', blocksNeeded: 2, allocatedBlocks: '[5, 6]', status: 'Success' },
      { step: 4, action: 'Delete fileB.txt', blocksNeeded: 0, allocatedBlocks: 'Blocks [2, 3, 4] freed', status: 'Hole of 3 blocks created' },
      { step: 5, action: 'Create fileD.txt (2048 B)', blocksNeeded: 4, allocatedBlocks: '[7, 8, 9, 10]', status: 'Skips hole [2, 3, 4] (too small); takes blocks 7-10' }
    ],
    walkthrough: `
- After Step 4, blocks \`2, 3, 4\` are free (a 3-block hole), and blocks \`7..31\` are free.
- In Step 5, \`fileD.txt\` requires 4 blocks.
- Even though there are 3 free blocks at \`[2, 3, 4]\`, First-Fit cannot place \`fileD.txt\` there because it requires **4 contiguous blocks**.
- The 3-block hole remains unused, illustrating **External Fragmentation**.
    `,
    sampleInputs: {
      algorithm: 'filesystem_simulator',
      inputs: {
        initialNodes: [
          { id: 'root', name: '/', type: 'directory', parentId: null, permissions: 'rwx', createdAt: 0 },
          { id: 'file_1', name: 'readme.txt', type: 'file', parentId: 'root', size: 1024, blocks: [0, 1], permissions: 'rw-', isOpen: false },
          { id: 'dir_1', name: 'docs', type: 'directory', parentId: 'root', permissions: 'rwx', createdAt: 0 }
        ],
        config: { totalBlocks: 32, blockSize: 512 }
      }
    }
  },
  keyTerms: [
    { term: 'Virtual File System (VFS)', definition: 'An abstraction layer that provides a uniform API for interacting with different file system types.' },
    { term: 'Contiguous Allocation', definition: 'A file allocation method where each file occupies a consecutive set of disk blocks.' },
    { term: 'External Fragmentation', definition: 'Unallocated disk blocks that exist in separated holes too small to satisfy new file requests.' },
    { term: 'Absolute Path', definition: 'A file path specified starting from the root directory (/), independent of current working directory.' },
    { term: 'Relative Path', definition: 'A file path specified relative to the current working directory.' },
    { term: 'File Descriptor', definition: 'An integer index used by processes to identify an open file in system calls.' }
  ],
  quiz: [
    {
      id: 'q1',
      question: 'What is the primary advantage of contiguous file allocation on disk?',
      options: [
        'It completely prevents external fragmentation',
        'Files can grow to infinite size without moving',
        'Extremely fast direct and sequential access with minimal head movement',
        'It requires no metadata or directory entries'
      ],
      correctAnswer: 2,
      explanation: 'Because all blocks of a file are located adjacent to each other on the disk platters, reading sequential blocks requires minimal head repositioning (seek time), maximizing read performance.'
    },
    {
      id: 'q2',
      question: 'What is the major disadvantage of contiguous file allocation?',
      options: [
        'High external fragmentation and difficulty in expanding files as they grow',
        'It cannot store files larger than 1 kilobyte',
        'It requires an optical drive to read',
        'Directory paths can only be one character long'
      ],
      correctAnswer: 0,
      explanation: 'As files are created, updated, and deleted, free blocks become fragmented into scattered holes. If a hole is smaller than a new file\'s total size, it cannot be used, causing external fragmentation. Expanding a file is also difficult if the neighboring block is occupied.'
    },
    {
      id: 'q3',
      question: 'Which of the following is an example of an absolute path?',
      options: [
        '../documents/report.pdf',
        '/var/log/syslog',
        './data/input.csv',
        'project/src/main.js'
      ],
      correctAnswer: 1,
      explanation: 'An absolute path begins with the root directory delimiter (/), completely specifying the location from the top of the tree regardless of the current working directory.'
    },
    {
      id: 'q4',
      question: 'What role does the system-wide open-file table play in an operating system?',
      options: [
        'It stores the passwords for all user accounts',
        'It tracks all files currently opened across the entire OS, their lock states, and reference counts',
        'It formats the hard drive when memory is full',
        'It executes user applications in real time'
      ],
      correctAnswer: 1,
      explanation: 'The system-wide open-file table contains an entry for every file that has been opened by any process in the system, maintaining reference counts and synchronizing file locks.'
    },
    {
      id: 'q5',
      question: 'In a file system with 512-byte blocks, how many blocks are required to store a file of 1200 bytes under contiguous allocation?',
      options: [
        '2 blocks',
        '3 blocks',
        '4 blocks',
        '1 block'
      ],
      correctAnswer: 1,
      explanation: 'ceil(1200 / 512) = ceil(2.34) = 3 blocks. The first two blocks store 512 bytes each (1024 bytes total), and the third block stores the remaining 176 bytes (with 336 bytes of internal fragmentation).'
    },
    {
      id: 'q6',
      question: 'What happens if a process attempts to execute a read() operation on a file that has not been opened?',
      options: [
        'The OS opens the file automatically with root permissions',
        'The system call returns an error indicating an invalid or closed file descriptor',
        'The CPU resets the system clock',
        'The file is deleted from the directory'
      ],
      correctAnswer: 1,
      explanation: 'Read and write system calls require a valid, open file descriptor. Attempting to read a closed or unopened file produces an error (such as EBADF in POSIX systems).'
    }
  ]
};
