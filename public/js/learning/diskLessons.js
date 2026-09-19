/**
 * Disk Scheduling Learning Module Content
 * Educational concepts, worked examples, key terms, quiz, and simulator presets.
 */

export const diskLessons = {
  id: 'disk',
  title: 'Disk Scheduling',
  description: 'Learn how hard drive read/write heads service I/O requests across cylinders using FCFS, SSTF, SCAN (Elevator), C-SCAN, LOOK, and C-LOOK to minimize mechanical seek time.',
  icon: '💿',
  simulatorRoute: '#/disk',
  objectives: [
    'Understand hard disk physical structure: platters, tracks, sectors, and cylinders.',
    'Differentiate between seek time, rotational latency, and data transfer time.',
    'Trace head movement trajectories for FCFS, SSTF, SCAN, C-SCAN, LOOK, and C-LOOK.',
    'Analyze the trade-offs between shortest seek time and starvation.',
    'Recognize how boundary conditions (e.g. cylinder 0 vs disk max) differ between SCAN and LOOK.'
  ],
  concepts: [
    {
      id: 'disk-geometry',
      title: 'Physical Disk Geometry & Seek Time',
      content: `
### Hard Disk Structure
A traditional Hard Disk Drive (HDD) consists of:
- **Platters**: Flat circular magnetic disks rotating at high speeds (e.g., 5400, 7200, or 15000 RPM).
- **Tracks**: Concentric circular rings on each platter surface where data bits are magnetically recorded.
- **Sectors**: Subdivisions of each track (typically 512 bytes or 4 KB) representing the smallest addressable unit.
- **Cylinders**: The set of all tracks across all platter surfaces that are at the exact same radial arm position.
- **Read/Write Head**: An electromagnetic head mounted on an actuator arm that sweeps radially across the spinning platters.

### Components of Disk Access Time
1. **Seek Time**: The time required for the actuator arm to mechanically reposition the read/write head to the target cylinder. **This is the dominant mechanical delay (typically 3–15 ms).**
2. **Rotational Latency**: The time spent waiting for the target sector to rotate underneath the head.
3. **Transfer Time**: The time to magnetically stream the data bits off the track into memory.

> [!NOTE]
> Operating system disk scheduling algorithms specifically optimize **Seek Time** by ordering pending I/O requests to minimize total mechanical cylinder movement. Rotational latency and transfer times are abstracted in standard OS scheduling models.
      `
    },
    {
      id: 'algorithms-overview',
      title: 'Disk Scheduling Algorithms',
      content: `
### 1. FCFS (First-Come, First-Served)
Requests are serviced strictly in the order they arrive in the I/O queue.
- **Advantage**: Completely fair; zero starvation.
- **Disadvantage**: Wild head swings back and forth across the platters, resulting in high total head movement.

### 2. SSTF (Shortest Seek Time First)
Selects the pending request with the minimum seek distance from the current head position.
- **Advantage**: Greatly reduces total head movement compared to FCFS.
- **Disadvantage**: **Prone to starvation** — if requests keep arriving near the current head position, distant cylinders may wait indefinitely.

### 3. SCAN (The Elevator Algorithm)
The disk arm starts at one end of the disk and moves toward the other end, servicing requests as it reaches each cylinder until it hits the **physical disk boundary (0 or Max)**. It then reverses direction and repeats.
- **Advantage**: Prevents starvation while providing good seek performance.

### 4. C-SCAN (Circular SCAN)
Designed to provide a more uniform wait time. Like SCAN, it moves in one direction servicing requests. However, when it reaches the end, it **immediately jumps back to the opposite boundary without servicing any requests on the return trip**, and begins scanning forward again.

### 5. LOOK and C-LOOK
Practical enhancements over SCAN and C-SCAN:
- **LOOK**: The arm travels only as far as the **last requested cylinder** in the current direction, then immediately reverses without traveling to the unneeded physical boundary cylinder (0 or Max).
- **C-LOOK**: Moves in one direction servicing requests until the last pending request, then immediately jumps back to the **first pending request** at the opposite end without going all the way to the boundary.
      `
    }
  ],
  workedExample: {
    title: 'Worked Example: SSTF vs. SCAN Comparison',
    description: 'Consider disk cylinder requests [98, 183, 37, 122, 14, 124, 65, 67] with initial head at 53 (Disk size: 0 to 199, direction: right):',
    table: [
      { step: 1, currentHead: 53, nextSSTF: 65, distSSTF: 12, nextSCAN: 65, distSCAN: 12 },
      { step: 2, currentHead: 65, nextSSTF: 67, distSSTF: 2, nextSCAN: 67, distSCAN: 2 },
      { step: 3, currentHead: 67, nextSSTF: 37, distSSTF: 30, nextSCAN: 98, distSCAN: 31 },
      { step: 4, currentHead: 98, nextSSTF: 14, distSSTF: 23, nextSCAN: 122, distSCAN: 24 },
      { step: 5, currentHead: 122, nextSSTF: 98, distSSTF: 84, nextSCAN: 124, distSCAN: 2 },
      { step: 6, currentHead: 124, nextSSTF: 122, distSSTF: 24, nextSCAN: 183, distSCAN: 59 },
      { step: 7, currentHead: 183, nextSSTF: 124, distSSTF: 2, nextSCAN: 199, distSCAN: 16 },
      { step: 8, currentHead: 199, nextSSTF: 183, distSSTF: 59, nextSCAN: 37, distSCAN: 162 },
      { step: 9, currentHead: 37, nextSSTF: 'Done', distSSTF: 0, nextSCAN: 14, distSCAN: 23 }
    ],
    walkthrough: `
- **SSTF Total Head Movement**:
  - Service Order: \`53 ➔ 65 ➔ 67 ➔ 37 ➔ 14 ➔ 98 ➔ 122 ➔ 124 ➔ 183\`
  - Total cylinders moved: $(65-53) + (67-65) + (67-37) + (37-14) + (98-14) + (122-98) + (124-122) + (183-124) = 236$ cylinders.
- **SCAN Total Head Movement (Direction: Right)**:
  - Moves right to boundary 199: \`53 ➔ 65 ➔ 67 ➔ 98 ➔ 122 ➔ 124 ➔ 183 ➔ 199\`
  - Reverses and moves left: \`199 ➔ 37 ➔ 14\`
  - Total cylinders moved: $(199 - 53) + (199 - 14) = 146 + 185 = 331$ cylinders.
- **LOOK (if used instead)**:
  - Would have reversed at 183 instead of 199, saving $(199 - 183) \\times 2 = 32$ cylinders!
    `,
    sampleInputs: {
      algorithm: 'disk_sstf',
      inputs: {
        requests: [98, 183, 37, 122, 14, 124, 65, 67],
        initialHead: 53,
        diskSize: 200,
        direction: 'right'
      }
    }
  },
  keyTerms: [
    { term: 'Seek Time', definition: 'The time taken by the disk arm to move the read/write head to the desired cylinder.' },
    { term: 'Cylinder', definition: 'The vertically aligned set of tracks across all platters at a given arm radius.' },
    { term: 'SSTF', definition: 'Shortest Seek Time First; chooses the request closest to the current head position.' },
    { term: 'SCAN', definition: 'The elevator algorithm; sweeps across the disk from boundary to boundary servicing requests.' },
    { term: 'C-SCAN', definition: 'Circular SCAN; services requests in one direction, then immediately returns to the start without servicing on the return trip.' },
    { term: 'LOOK / C-LOOK', definition: 'Variants of SCAN / C-SCAN that reverse or jump as soon as the last pending request is reached, avoiding unnecessary trips to the physical disk boundary.' }
  ],
  quiz: [
    {
      id: 'q1',
      question: 'Which component of disk access time takes the longest mechanical duration to perform?',
      options: [
        'Data transfer time',
        'Seek time (arm repositioning)',
        'Operating system interrupt handling',
        'Bus transmission time'
      ],
      correctAnswer: 1,
      explanation: 'Seek time requires physical mechanical movement of the heavy actuator arm across the platters, making it by far the slowest part of disk access (3–15 ms compared to fractions of a millisecond for transfer).'
    },
    {
      id: 'q2',
      question: 'What is the main drawback of the Shortest Seek Time First (SSTF) algorithm?',
      options: [
        'It causes excessive head wear by always moving to cylinder 0',
        'It can cause starvation of requests that are far from the current head position',
        'It is non-deterministic and produces random outputs',
        'It requires disk platters to spin in reverse'
      ],
      correctAnswer: 1,
      explanation: 'SSTF prioritizes requests near the current head. If a stream of nearby requests continuously arrives, distant requests may wait indefinitely (starvation).'
    },
    {
      id: 'q3',
      question: 'How does LOOK differ from the standard SCAN algorithm?',
      options: [
        'LOOK only services read requests, ignoring writes',
        'LOOK reverses direction at the last requested cylinder rather than traveling all the way to the disk boundary',
        'LOOK moves twice as fast across the disk surface',
        'LOOK requires an optical laser instead of a magnetic head'
      ],
      correctAnswer: 1,
      explanation: 'LOOK inspects pending requests and only travels as far as the furthest request in the current direction, reversing immediately without wasting time reaching the physical cylinder boundary (0 or Max).'
    },
    {
      id: 'q4',
      question: 'Why does C-SCAN return to the beginning of the disk without servicing requests on the return sweep?',
      options: [
        'To provide a more uniform, predictable waiting time for all cylinders',
        'Because the read/write head is mechanically disabled in reverse',
        'To reduce power consumption of the actuator motor',
        'Because the disk platters stop spinning during reverse movement'
      ],
      correctAnswer: 0,
      explanation: 'In SCAN, cylinders near the ends are serviced less frequently than cylinders in the middle. C-SCAN treats cylinders as a circular list, returning to the start to maintain an equitable, uniform wait distribution.'
    },
    {
      id: 'q5',
      question: 'In a disk with cylinders 0 to 199, if the head is at 50 moving right, and requests are at 40 and 60, where does SSTF move next?',
      options: [
        'Cylinder 40',
        'Cylinder 60',
        'Cylinder 0',
        'Cylinder 199'
      ],
      correctAnswer: 1,
      explanation: 'Distance to 60 is |50 - 60| = 10. Distance to 40 is |50 - 40| = 10. With equal distance, the simulator tie-breaker continues in the current direction (right to 60).'
    },
    {
      id: 'q6',
      question: 'Which disk scheduling algorithm guarantees that no request will ever suffer from starvation?',
      options: [
        'Shortest Seek Time First (SSTF)',
        'First-Come, First-Served (FCFS)',
        'Priority Disk Scheduling',
        'Greedy Cylinder Scheduling'
      ],
      correctAnswer: 1,
      explanation: 'FCFS services every request strictly in arrival order, ensuring that every request is eventually reached and eliminating starvation entirely.'
    }
  ]
};
