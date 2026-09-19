/**
 * Deadlock Management Learning Module Content
 * Educational concepts, worked examples, key terms, quiz, and simulator presets.
 */

export const deadlockLessons = {
  id: 'deadlock',
  title: 'Deadlock Management',
  description: 'Master deadlock characterization, the 4 Coffman conditions, Resource Allocation Graphs (RAGs), and Banker\'s Safety and Resource Request algorithms for deadlock avoidance.',
  icon: '🔒',
  simulatorRoute: '#/deadlock',
  objectives: [
    'Define a deadlock and contrast it with starvation and livelock.',
    'Examine the four Coffman conditions necessary for deadlock to occur.',
    'Construct and analyze Resource Allocation Graphs (RAG) for single- and multi-instance resource systems.',
    'Differentiate between Safe, Unsafe, and Deadlocked states.',
    'Calculate the Need matrix and execute Banker\'s Safety Algorithm step-by-step.',
    'Evaluate resource allocation requests using Banker\'s Resource Request Algorithm.'
  ],
  concepts: [
    {
      id: 'deadlock-definition',
      title: 'Deadlock Definition & The 4 Coffman Conditions',
      content: `
### What is a Deadlock?
A **Deadlock** is a situation in an operating system where a set of processes are blocked because each process is holding a resource and waiting for another resource acquired by some other process in the same set. None of the processes can run, release resources, or be awakened.

### The Four Necessary Coffman Conditions
For a deadlock to arise, all four of the following conditions must hold simultaneously:

1. **Mutual Exclusion**: At least one resource must be held in a non-sharable mode (only one process can hold the resource at a time).
2. **Hold and Wait**: A process must currently be holding at least one resource and waiting to acquire additional resources held by other processes.
3. **No Preemption**: Resources cannot be forcibly preempted from a process; a resource can only be released voluntarily by the holding process after completing its task.
4. **Circular Wait**: A closed chain of processes exists $\\{P_0, P_1, \\dots, P_n\\}$ such that $P_0$ waits for a resource held by $P_1$, $P_1$ waits for $P_2$, ..., and $P_n$ waits for $P_0$.

> [!TIP]
> If an operating system can prevent or invalidate even **one** of these four conditions, a deadlock becomes mathematically impossible.
      `
    },
    {
      id: 'rag',
      title: 'Resource Allocation Graph (RAG)',
      content: `
A **Resource Allocation Graph (RAG)** is a directed graph $G = (V, E)$ used to model system state:
- **Vertices ($V$)**:
  - **Processes**: Represented as circles ($P_i$).
  - **Resources**: Represented as rectangles ($R_j$), with internal dots representing the number of available instances of that resource.
- **Edges ($E$)**:
  - **Request Edge ($P_i \\rightarrow R_j$)**: Directed from a process to a resource, indicating that $P_i$ has requested an instance of $R_j$ and is currently waiting.
  - **Assignment Edge ($R_j \\rightarrow P_i$)**: Directed from an instance of $R_j$ to $P_i$, indicating that an instance of $R_j$ is currently allocated to $P_i$.

#### Cycle vs. Deadlock Caveat:
- If the graph contains **no cycles**, the system is definitely **not deadlocked**.
- If the graph contains a **cycle**:
  - If every resource type has **exactly one instance**, a cycle is both necessary and sufficient for **deadlock**.
  - If resource types have **multiple instances**, a cycle indicates a potential deadlock, but does **not** guarantee one (an uninvolved process holding an instance of the cycled resource might release it later).
      `
    },
    {
      id: 'safe-state',
      title: 'Safe State vs. Unsafe State vs. Deadlock',
      content: `
A crucial distinction in operating system theory is:

$$\\text{Deadlocked State} \\subset \\text{Unsafe State} \\subset \\text{All States}$$

- **Safe State**: A state is safe if there exists a **Safe Sequence** $\\langle P_0, P_1, \\dots, P_{n-1} \\rangle$ of processes such that for each $P_i$, the maximum resources $P_i$ may still request can be satisfied by the currently available resources plus the resources already held by all preceding processes $P_j$ (where $j < i$).
- **Unsafe State**: A state where no safe sequence exists.
  > [!IMPORTANT]
  > **An unsafe state is NOT automatically equivalent to an already-existing deadlock.** An unsafe state merely means that the operating system can no longer guarantee the avoidance of deadlock if all processes suddenly request their declared maximum claims simultaneously.
- **Deadlock Avoidance Goal**: Ensure that the system never enters an unsafe state.
      `
    },
    {
      id: 'bankers-algorithm',
      title: 'Banker\'s Algorithm (Safety & Request)',
      content: `
The **Banker's Algorithm** (developed by Edsger Dijkstra) tests for safety by simulating the worst-case resource allocation:

### Data Structures ($n$ processes, $m$ resources):
1. **Available**: Vector of length $m$. $\\text{Available}[j]$ is the number of free instances of resource $R_j$.
2. **Max**: $n \\times m$ matrix. $\\text{Max}[i][j]$ is the maximum demand of process $P_i$ for $R_j$.
3. **Allocation**: $n \\times m$ matrix. $\\text{Allocation}[i][j]$ is the number of instances of $R_j$ currently allocated to $P_i$.
4. **Need**: $n \\times m$ matrix. $\\text{Need}[i][j] = \\text{Max}[i][j] - \\text{Allocation}[i][j]$.

### Banker\'s Safety Algorithm
1. Let $\\text{Work} = \\text{Available}$ and $\\text{Finish}[i] = \\text{false}$ for all $i$.
2. Find an index $i$ such that $\\text{Finish}[i] == \\text{false}$ and $\\text{Need}[i] \\le \\text{Work}$.
   - If no such $i$ exists, go to Step 4.
3. $\\text{Work} = \\text{Work} + \\text{Allocation}[i]$, $\\text{Finish}[i] = \\text{true}$. Repeat Step 2.
4. If $\\text{Finish}[i] == \\text{true}$ for all $i$, the system is in a **Safe State** with the safe sequence. Otherwise, it is **Unsafe**.

### Resource Request Algorithm
When $P_i$ requests a vector $\\text{Request}_i$:
1. If $\\text{Request}_i > \\text{Need}_i$, throw error: process exceeded maximum claim.
2. If $\\text{Request}_i > \\text{Available}$, process $P_i$ must wait (resources not available).
3. **Tentative Allocation**:
   $$\\text{Available}' = \\text{Available} - \\text{Request}_i$$
   $$\\text{Allocation}'_i = \\text{Allocation}_i + \\text{Request}_i$$
   $$\\text{Need}'_i = \\text{Need}_i - \\text{Request}_i$$
4. Run the Safety Algorithm on the tentative state:
   - If **Safe**: Grant the request.
   - If **Unsafe**: Deny the request, roll back changes, and make $P_i$ wait.
      `
    }
  ],
  workedExample: {
    title: 'Worked Example: Silberschatz 5-Process Banker\'s Safety',
    description: 'Consider 5 processes (P0–P4) and 3 resource types A (10 total), B (5 total), C (7 total). Initial Available = [3, 3, 2]:',
    table: [
      { process: 'P0', alloc: '[0, 1, 0]', max: '[7, 5, 3]', need: '[7, 4, 3]' },
      { process: 'P1', alloc: '[2, 0, 0]', max: '[3, 2, 2]', need: '[1, 2, 2]' },
      { process: 'P2', alloc: '[3, 0, 2]', max: '[9, 0, 2]', need: '[6, 0, 0]' },
      { process: 'P3', alloc: '[2, 1, 1]', max: '[2, 2, 2]', need: '[0, 1, 1]' },
      { process: 'P4', alloc: '[0, 0, 2]', max: '[4, 3, 3]', need: '[4, 3, 1]' }
    ],
    walkthrough: `
- Initial Available: $\\text{Work} = [3, 3, 2]$
- **Step 1**: Check P0: $\\text{Need} [7, 4, 3] \\le [3, 3, 2]$ (False). Check P1: $\\text{Need} [1, 2, 2] \\le [3, 3, 2]$ (**True**).
  - P1 finishes! $\\text{Work} = [3, 3, 2] + [2, 0, 0] = [5, 3, 2]$. Sequence: $\\langle P1 \\rangle$.
- **Step 2**: Check P3: $\\text{Need} [0, 1, 1] \\le [5, 3, 2]$ (**True**).
  - P3 finishes! $\\text{Work} = [5, 3, 2] + [2, 1, 1] = [7, 4, 3]$. Sequence: $\\langle P1, P3 \\rangle$.
- **Step 3**: Check P4: $\\text{Need} [4, 3, 1] \\le [7, 4, 3]$ (**True**).
  - P4 finishes! $\\text{Work} = [7, 4, 3] + [0, 0, 2] = [7, 4, 5]$. Sequence: $\\langle P1, P3, P4 \\rangle$.
- **Step 4**: Check P0: $\\text{Need} [7, 4, 3] \\le [7, 4, 5]$ (**True**).
  - P0 finishes! $\\text{Work} = [7, 4, 5] + [0, 1, 0] = [7, 5, 5]$. Sequence: $\\langle P1, P3, P4, P0 \\rangle$.
- **Step 5**: Check P2: $\\text{Need} [6, 0, 0] \\le [7, 5, 5]$ (**True**).
  - P2 finishes! $\\text{Work} = [7, 5, 5] + [3, 0, 2] = [10, 5, 7]$. Sequence: $\\langle P1, P3, P4, P0, P2 \\rangle$.
- **Verdict**: All processes completed! The system is in a **SAFE state** with safe sequence $\\langle P1, P3, P4, P0, P2 \\rangle$.
    `,
    sampleInputs: {
      algorithm: 'deadlock_bankers_safety',
      inputs: {
        processes: ['P0', 'P1', 'P2', 'P3', 'P4'],
        available: [3, 3, 2],
        max: [
          [7, 5, 3],
          [3, 2, 2],
          [9, 0, 2],
          [2, 2, 2],
          [4, 3, 3]
        ],
        allocation: [
          [0, 1, 0],
          [2, 0, 0],
          [3, 0, 2],
          [2, 1, 1],
          [0, 0, 2]
        ]
      }
    }
  },
  keyTerms: [
    { term: 'Coffman Conditions', definition: 'The 4 necessary conditions for deadlock: Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait.' },
    { term: 'Safe State', definition: 'A system state where there exists at least one sequence of process execution that allows all processes to finish without deadlock.' },
    { term: 'Unsafe State', definition: 'A state where no safe sequence exists; deadlock is possible if processes request maximum claims.' },
    { term: 'Resource Allocation Graph (RAG)', definition: 'A directed graph showing processes, resource instances, requests, and assignments.' },
    { term: 'Banker\'s Algorithm', definition: 'A deadlock avoidance algorithm that tests for safety by simulating tentative allocations before granting requests.' },
    { term: 'Need Matrix', definition: 'The remaining resource requirements for each process, calculated as Need = Max - Allocation.' }
  ],
  quiz: [
    {
      id: 'q1',
      question: 'Which of the following is NOT one of the four Coffman conditions necessary for deadlock?',
      options: [
        'Mutual Exclusion',
        'Hold and Wait',
        'High CPU Utilization',
        'Circular Wait'
      ],
      correctAnswer: 2,
      explanation: 'High CPU utilization is a performance metric, not a deadlock condition. The four Coffman conditions are Mutual Exclusion, Hold and Wait, No Preemption, and Circular Wait.'
    },
    {
      id: 'q2',
      question: 'Is an "Unsafe State" in operating systems always deadlocked?',
      options: [
        'Yes, an unsafe state is strictly identical to an active deadlock',
        'No, an unsafe state is not automatically deadlocked; it simply cannot guarantee avoidance if processes make maximum claims',
        'Yes, all processes in an unsafe state terminate immediately',
        'No, an unsafe state only occurs when virtual memory runs out'
      ],
      correctAnswer: 1,
      explanation: 'An unsafe state means that the OS cannot guarantee deadlock avoidance under worst-case demands. If processes do not request their full maximum claims simultaneously, the system may still avoid deadlock.'
    },
    {
      id: 'q3',
      question: 'In a Resource Allocation Graph (RAG) where each resource type has multiple instances, what does a cycle indicate?',
      options: [
        'A deadlock is guaranteed to exist',
        'A deadlock may exist, but is not guaranteed',
        'The system has definitely crashed',
        'All resources have been freed'
      ],
      correctAnswer: 1,
      explanation: 'In multi-instance resource systems, a cycle is a necessary condition for deadlock, but not sufficient. Another process holding an instance of the cycled resource may release it, breaking the wait.'
    },
    {
      id: 'q4',
      question: 'How is the Need matrix calculated in the Banker\'s Algorithm?',
      options: [
        'Need = Max + Allocation',
        'Need = Max - Allocation',
        'Need = Available - Allocation',
        'Need = Max - Available'
      ],
      correctAnswer: 1,
      explanation: 'Need represents how many more resource instances a process may still request to complete its execution: Need[i][j] = Max[i][j] - Allocation[i][j].'
    },
    {
      id: 'q5',
      question: 'In Banker\'s Resource Request Algorithm, what happens if a tentative allocation leads to an Unsafe state?',
      options: [
        'The request is granted anyway and the OS resets the hardware',
        'The request is denied, state is rolled back, and the process is made to wait',
        'The requesting process is terminated and its memory deleted',
        'The process is upgraded to kernel mode'
      ],
      correctAnswer: 1,
      explanation: 'To avoid deadlock, if granting a request would push the system from a Safe state into an Unsafe state, the allocation is rolled back and the requesting process must wait.'
    },
    {
      id: 'q6',
      question: 'What is the direction of a Request Edge in a Resource Allocation Graph?',
      options: [
        'From Resource to Process (R ➔ P)',
        'From Process to Resource (P ➔ R)',
        'Between two Processes (P ➔ P)',
        'Between two Resources (R ➔ R)'
      ],
      correctAnswer: 1,
      explanation: 'A Request Edge points from a Process to a Resource (P ➔ R), indicating that the process is waiting for an instance of that resource. An Assignment Edge points from Resource to Process (R ➔ P).'
    },
    {
      id: 'q7',
      question: 'If a system has 2 instances of Resource R and 2 processes P1 and P2 each holding 1 instance and requesting 1 more, what state is the system in?',
      options: [
        'Safe state with sequence <P1, P2>',
        'Deadlock state (Circular Wait with 0 available)',
        'Ready state',
        'Livelock with preemptive recovery'
      ],
      correctAnswer: 1,
      explanation: 'Both instances of R are allocated (0 available). P1 holds 1 and waits for 1; P2 holds 1 and waits for 1. Neither can finish without the other releasing. This is an active deadlock.'
    }
  ]
};
