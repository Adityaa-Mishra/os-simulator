/**
 * CPU Scheduling Learning Module Content
 * Educational concepts, worked examples, key terms, quiz, and simulator presets.
 */

export const cpuLessons = {
  id: 'cpu',
  title: 'CPU Scheduling',
  description: 'Understand how operating systems allocate limited CPU cores among competing processes to maximize throughput, minimize latency, and prevent starvation.',
  icon: '⚡',
  simulatorRoute: '#/cpu',
  objectives: [
    'Understand the role of the CPU scheduler and the dispatcher in operating systems.',
    'Differentiate between preemptive and non-preemptive scheduling algorithms.',
    'Calculate Arrival, Burst, Completion, Turnaround, Waiting, and Response times.',
    'Construct and interpret Gantt charts for FCFS, SJF, SRTF, Round Robin, and Priority Scheduling.',
    'Analyze trade-offs between fairness, response time, and throughput across different workloads.'
  ],
  concepts: [
    {
      id: 'fundamentals',
      title: 'CPU Scheduling Fundamentals',
      content: `
### What is CPU Scheduling?
In a multiprogramming operating system, multiple processes reside in memory simultaneously. Whenever the CPU becomes idle, the operating system must select one of the processes in the **Ready Queue** to execute. This decision is made by the **CPU Scheduler** (short-term scheduler), while the **Dispatcher** handles the actual context switch to grant control of the CPU to the selected process.

### Preemptive vs. Non-Preemptive Scheduling
- **Non-Preemptive Scheduling**: Once a process is allocated the CPU, it retains control until it terminates or voluntarily yields the CPU (e.g., to perform an I/O operation).
  - Examples: **FCFS (First-Come, First-Served)**, **Non-preemptive SJF**, **Non-preemptive Priority**.
  - Advantage: Simple, minimal context switching overhead.
  - Disadvantage: Poor response time; prone to the **Convoy Effect**.
- **Preemptive Scheduling**: The operating system can interrupt a currently running process and switch the CPU to a higher-priority or newly arrived process.
  - Examples: **SRTF (Shortest Remaining Time First)**, **Round Robin (RR)**, **Preemptive Priority**.
  - Advantage: Highly responsive; prevents CPU hogs from starving interactive jobs.
  - Disadvantage: Frequent context switches incur CPU overhead.
      `
    },
    {
      id: 'metrics',
      title: 'Scheduling Metrics & Time Definitions',
      content: `
To evaluate and compare scheduling policies, operating systems use precise time metrics:

- **Arrival Time ($AT$)**: The exact moment the process enters the Ready Queue.
- **Burst Time ($BT$)**: The total CPU execution time required by the process to complete its task.
- **Completion Time ($CT$)**: The moment the process finishes its final CPU burst.
- **Turnaround Time ($TAT$)**: Total elapsed time from process arrival to its completion.
  $$\\text{Turnaround Time} = \\text{Completion Time} - \\text{Arrival Time}$$
- **Waiting Time ($WT$)**: The total duration a process spends waiting in the Ready Queue.
  $$\\text{Waiting Time} = \\text{Turnaround Time} - \\text{Burst Time}$$
- **Response Time ($RT$)**: Time from arrival to when the process gets the CPU for the very first time.
  $$\\text{Response Time} = \\text{First CPU Allocation Time} - \\text{Arrival Time}$$
- **Throughput**: Number of processes completed per unit of time.
- **CPU Utilization**: Percentage of time the CPU is actively executing user or kernel processes.
      `
    },
    {
      id: 'algorithms',
      title: 'Scheduling Algorithms',
      content: `
### 1. First-Come, First-Served (FCFS)
Processes are dispatched strictly in the order of their arrival. It is non-preemptive and implemented using a standard FIFO queue.
- **Drawback**: **Convoy Effect** — short processes get stuck waiting behind long CPU-bound processes, resulting in high average waiting times.

### 2. Shortest Job First (SJF - Non-Preemptive)
The process with the smallest burst time is scheduled next.
- **Optimality**: Provably yields the minimum average waiting time for a given set of stationary processes.
- **Drawback**: Impossible to know future burst times in advance (must be estimated). Can cause starvation for long jobs.

### 3. Shortest Remaining Time First (SRTF - Preemptive SJF)
If a new process arrives with a remaining burst time shorter than the currently running process's remaining time, the running process is preempted.
- Highly responsive for short jobs, but increases context-switching overhead.

### 4. Round Robin (RR - Preemptive)
Designed for time-sharing systems. The CPU is allocated to each process for a fixed time interval called a **Time Quantum** (or time slice).
- When the quantum expires, the process is preempted and returned to the tail of the Ready Queue.
- **Quantum Sizing**: Too large $\\rightarrow$ degenerates into FCFS; too small $\\rightarrow$ excessive context switch overhead degrades performance.

### 5. Priority Scheduling (Preemptive & Non-Preemptive)
Each process is assigned a priority integer (in this simulator, lower integer represents higher priority).
- **Drawback**: **Starvation (Indefinite Blocking)** — low-priority jobs may never run if high-priority processes keep arriving.
- **Solution**: **Aging** — gradually incrementing the priority of processes as they wait in the ready queue.
      `
    }
  ],
  workedExample: {
    title: 'Worked Example: FCFS vs. Round Robin (Quantum = 2)',
    description: 'Consider 4 processes arriving at the specified times with given burst times:',
    table: [
      { process: 'P1', arrivalTime: 0, burstTime: 5 },
      { process: 'P2', arrivalTime: 1, burstTime: 3 },
      { process: 'P3', arrivalTime: 2, burstTime: 1 },
      { process: 'P4', arrivalTime: 3, burstTime: 2 }
    ],
    walkthrough: `
#### Scenario A: FCFS Execution
- **Gantt Chart**: \`[0 --- P1 --- 5][5 --- P2 --- 8][8 --- P3 --- 9][9 --- P4 --- 11]\`
- **Calculations**:
  - P1: $CT = 5$, $TAT = 5 - 0 = 5$, $WT = 5 - 5 = 0$
  - P2: $CT = 8$, $TAT = 8 - 1 = 7$, $WT = 7 - 3 = 4$
  - P3: $CT = 9$, $TAT = 9 - 2 = 7$, $WT = 7 - 1 = 6$
  - P4: $CT = 11$, $TAT = 11 - 3 = 8$, $WT = 8 - 2 = 6$
- **Average Turnaround Time**: $(5 + 7 + 7 + 8) / 4 = 6.75$ units
- **Average Waiting Time**: $(0 + 4 + 6 + 6) / 4 = 4.00$ units

#### Scenario B: Round Robin (Quantum = 2)
- **Gantt Chart**: \`[0-2: P1][2-4: P2][4-5: P3][5-7: P1][7-9: P4][9-10: P2][10-11: P1]\`
- **Notice**: Short job P3 completes at time 5 instead of waiting until time 8!
- **Average Turnaround Time**: $7.25$ units
- **Average Waiting Time**: $4.50$ units
- While average waiting time is slightly higher due to interleaving, **Response Time** for all processes is substantially lower and fair.
    `,
    sampleInputs: {
      algorithm: 'cpu_fcfs',
      inputs: {
        processes: [
          { id: 'P1', arrivalTime: 0, burstTime: 5, priority: 1 },
          { id: 'P2', arrivalTime: 1, burstTime: 3, priority: 2 },
          { id: 'P3', arrivalTime: 2, burstTime: 1, priority: 3 },
          { id: 'P4', arrivalTime: 3, burstTime: 2, priority: 4 }
        ]
      }
    }
  },
  keyTerms: [
    { term: 'Burst Time', definition: 'The amount of time a process requires the CPU for execution.' },
    { term: 'Turnaround Time', definition: 'The interval from the time of submission of a process to the time of completion.' },
    { term: 'Waiting Time', definition: 'The sum of the periods spent waiting in the ready queue.' },
    { term: 'Time Quantum', definition: 'The maximum continuous time slice allocated to a process in Round Robin scheduling.' },
    { term: 'Convoy Effect', definition: 'A phenomenon where slow, CPU-bound processes delay many short processes behind them in FCFS.' },
    { term: 'Starvation', definition: 'A situation where a runnable process waits indefinitely because other processes continuously preempt it.' },
    { term: 'Aging', definition: 'A technique of gradually increasing the priority of processes that wait in the system for a long time.' }
  ],
  quiz: [
    {
      id: 'q1',
      question: 'Which scheduling algorithm is provably optimal in terms of minimizing average waiting time for a set of stationary processes?',
      options: [
        'First-Come, First-Served (FCFS)',
        'Round Robin (RR)',
        'Shortest Job First (SJF)',
        'Priority Scheduling'
      ],
      correctAnswer: 2,
      explanation: 'Shortest Job First (SJF) is mathematically optimal because scheduling the shortest job first moves it out of the ready queue earliest, minimizing the waiting time for all subsequent processes.'
    },
    {
      id: 'q2',
      question: 'What is the "Convoy Effect" in CPU scheduling?',
      options: [
        'Processes repeatedly preempting each other due to a very small time quantum',
        'Short processes being delayed behind a long CPU-bound process in non-preemptive FCFS',
        'A deadlock caused by circular wait of four or more processes',
        'Operating system threads taking over user process priority levels'
      ],
      correctAnswer: 1,
      explanation: 'The Convoy Effect occurs in FCFS when multiple I/O-bound or short jobs wait in the ready queue behind a single long, CPU-bound process, resulting in poor CPU and device utilization.'
    },
    {
      id: 'q3',
      question: 'If a process arrives at time 2 and finishes execution at time 10 with a burst time of 3, what is its Waiting Time?',
      options: [
        '8 units',
        '5 units',
        '10 units',
        '3 units'
      ],
      correctAnswer: 1,
      explanation: 'Turnaround Time = Completion Time - Arrival Time = 10 - 2 = 8. Waiting Time = Turnaround Time - Burst Time = 8 - 3 = 5 units.'
    },
    {
      id: 'q4',
      question: 'What happens in Round Robin scheduling if the time quantum is set to an extremely large value?',
      options: [
        'It degenerates into Shortest Remaining Time First (SRTF)',
        'It behaves identically to First-Come, First-Served (FCFS)',
        'The system crashes due to stack overflow in the scheduler',
        'Every process starves indefinitely'
      ],
      correctAnswer: 1,
      explanation: 'If the time quantum is larger than the burst time of any process, every process runs to completion on its first turn without preemption, exactly like FCFS.'
    },
    {
      id: 'q5',
      question: 'Which technique is commonly used to prevent starvation in Priority Scheduling?',
      options: [
        'Increasing the time quantum',
        'Aging (gradually increasing the priority of waiting processes)',
        'Disabling context switching',
        'Converting all processes into real-time threads'
      ],
      correctAnswer: 1,
      explanation: 'Aging gradually increases the priority of processes that spend a long time waiting in the ready queue, ensuring that even low-priority jobs eventually achieve top priority and execute.'
    },
    {
      id: 'q6',
      question: 'In preemptive scheduling, when can a running process be moved back to the Ready state?',
      options: [
        'Only when it voluntarily terminates',
        'When an interrupt occurs or a higher-priority process arrives',
        'Only when it issues an explicit I/O system call',
        'Never; running processes always run until completion'
      ],
      correctAnswer: 1,
      explanation: 'Preemptive schedulers can interrupt a currently running process when a timer interrupt fires (e.g. quantum expiry in Round Robin) or when a higher-priority process becomes ready.'
    }
  ]
};
