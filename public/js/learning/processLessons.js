/**
 * Process Management Learning Module Content
 * Educational concepts, worked examples, key terms, quiz, and simulator presets.
 */

export const processLessons = {
  id: 'process',
  title: 'Process Management',
  description: 'Explore the life cycle of operating system processes, Process Control Blocks (PCBs), context switching, and state transitions between Ready, Running, and Waiting queues.',
  icon: '🔄',
  simulatorRoute: '#/process',
  objectives: [
    'Distinguish between a passive program on disk and an active process in memory.',
    'Examine the components of a Process Control Block (PCB).',
    'Trace process transitions across the 5 standard states: New, Ready, Running, Waiting, and Terminated.',
    'Understand the mechanics and overhead of CPU context switching.',
    'Analyze how CPU-bound vs. I/O-bound burst patterns influence system performance.'
  ],
  concepts: [
    {
      id: 'process-definition',
      title: 'Program vs. Process & The PCB',
      content: `
### Program vs. Process
- A **Program** is a passive entity—an executable file stored on persistent disk storage (e.g., \`/bin/ls\` or \`app.exe\`).
- A **Process** is an active entity—a program in execution with a dedicated address space, program counter, register contents, call stack, and open file descriptors.

### The Process Control Block (PCB)
The operating system represents each process using a dedicated data structure called the **Process Control Block (PCB)** (or task descriptor in Linux). Key fields in a PCB include:
1. **Process ID (PID)**: Unique numerical identifier assigned by the OS.
2. **Process State**: Current state (\`New\`, \`Ready\`, \`Running\`, \`Waiting\`, or \`Terminated\`).
3. **Program Counter (PC)**: Memory address of the next instruction to execute.
4. **CPU Registers**: Accumulators, index registers, stack pointers, and condition codes saved during preemption.
5. **CPU Scheduling Information**: Priority level, scheduling queue pointers, and accumulated CPU time.
6. **Memory Management Information**: Base and limit registers or page table base addresses.
7. **Accounting & I/O Status**: Accumulated execution time, CPU/IO burst counters, and list of allocated I/O devices or open files.
      `
    },
    {
      id: 'lifecycle',
      title: 'The 5-State Process Lifecycle',
      content: `
A process transitions through five primary states throughout its execution:

1. **New**: The process is in the process of being created and initialized by the OS.
2. **Ready**: The process is loaded in memory and waiting to be allocated a CPU core by the scheduler.
3. **Running**: Instructions are actively being executed on a CPU core.
4. **Waiting (Blocked)**: The process is suspended waiting for an external event to complete (such as user input, disk I/O, or a timer).
5. **Terminated**: The process has finished execution and the OS is reclaiming its allocated resources.

#### State Transitions:
- **Admitted**: \`New\` $\\rightarrow$ \`Ready\` (OS loads process image and creates PCB).
- **Scheduler Dispatch**: \`Ready\` $\\rightarrow$ \`Running\` (Scheduler allocates CPU).
- **Interrupt / Timeout**: \`Running\` $\\rightarrow$ \`Ready\` (Timer interrupt or preemption).
- **I/O or Event Wait**: \`Running\` $\\rightarrow$ \`Waiting\` (System call issued, e.g., \`read()\`).
- **I/O or Event Completion**: \`Waiting\` $\\rightarrow$ \`Ready\` (Hardware interrupt signals data ready).
- **Exit**: \`Running\` $\\rightarrow$ \`Terminated\` (Process finishes or encounters fatal error).
      `
    },
    {
      id: 'context-switch',
      title: 'Context Switching & CPU/I/O Bursts',
      content: `
### What is a Context Switch?
When the CPU switches from executing Process A to Process B, the OS must perform a **Context Switch**:
1. Save the CPU state (program counter, registers, stack pointer) of Process A into its PCB.
2. Update Process A's state in its PCB (e.g., to \`Ready\` or \`Waiting\`).
3. Select Process B from the Ready Queue.
4. Restore Process B's state from its PCB into the physical CPU hardware registers.
5. Jump to the instruction address specified by Process B's restored Program Counter.

> [!NOTE]
> Context switch time is pure computational overhead. The CPU does no useful application work while switching contexts. Hardware support (such as multiple register sets) helps minimize this duration.

### CPU Bursts and I/O Bursts
Process execution consists of an alternating cycle of **CPU bursts** (intense arithmetic/instruction execution) and **I/O bursts** (waiting for data transfers).
- **CPU-bound processes**: Spend the majority of their time computing (long CPU bursts, few short I/O bursts).
- **I/O-bound processes**: Spend the majority of their time waiting for I/O (short CPU bursts, long I/O waits).
      `
    }
  ],
  workedExample: {
    title: 'Worked Example: Process Lifecycle & I/O Burst Transition',
    description: 'Trace Process P1 through an execution lifecycle with alternating CPU and I/O bursts:',
    table: [
      { step: 1, action: 'Process Creation', state: 'New ➔ Ready', details: 'PCB allocated, memory initialized, PID 101 assigned.' },
      { step: 2, action: 'CPU Dispatch', state: 'Ready ➔ Running', details: 'CPU scheduler selects P1. CPU burst of 4 cycles begins.' },
      { step: 3, action: 'System Call', state: 'Running ➔ Waiting', details: 'At cycle 4, P1 requests disk read (I/O burst of 3 cycles).' },
      { step: 4, action: 'I/O Interrupt', state: 'Waiting ➔ Ready', details: 'Disk controller finishes transfer; P1 moves back to Ready Queue.' },
      { step: 5, action: 'Second Dispatch', state: 'Ready ➔ Running', details: 'P1 re-allocated CPU; executes final CPU burst of 2 cycles.' },
      { step: 6, action: 'Process Termination', state: 'Running ➔ Terminated', details: 'P1 calls exit(); OS deallocates memory and closes files.' }
    ],
    walkthrough: `
- When P1 enters the \`Waiting\` state at Step 3, the CPU becomes completely free.
- A well-designed scheduler immediately dispatches another ready process (e.g., P2) to the CPU, keeping CPU utilization high while P1 waits for disk hardware.
- Once the hardware I/O interrupt fires at Step 4, P1 does **not** jump directly to the CPU; it enters the **Ready Queue** to await its next scheduled turn.
    `,
    sampleInputs: {
      algorithm: 'process_simulator',
      inputs: {
        processes: [
          { id: 'P1', name: 'Web Server', priority: 2, cpuBurst: 4, ioBurst: 3 },
          { id: 'P2', name: 'Data Compression', priority: 1, cpuBurst: 6, ioBurst: 1 }
        ]
      }
    }
  },
  keyTerms: [
    { term: 'Process Control Block (PCB)', definition: 'The data structure maintained by the OS containing all state, register, and accounting info for a process.' },
    { term: 'Context Switch', definition: 'The procedure of saving the execution state of one process and loading that of another.' },
    { term: 'Program Counter', definition: 'A register in the CPU containing the memory address of the next instruction to be executed.' },
    { term: 'Ready Queue', definition: 'A queue of processes in memory that are ready and waiting to execute on a CPU core.' },
    { term: 'I/O Bound', definition: 'A process that spends more time doing I/O operations than using the CPU.' },
    { term: 'CPU Bound', definition: 'A process that spends the majority of its time performing computations using the CPU.' }
  ],
  quiz: [
    {
      id: 'q1',
      question: 'What is the primary difference between a program and a process?',
      options: [
        'A program is written in high-level code, while a process is machine code',
        'A program is a passive file on disk, whereas a process is an active executing entity in memory',
        'A program can only use one CPU core, whereas a process always uses all cores',
        'There is no difference; the terms are interchangeable in operating systems'
      ],
      correctAnswer: 1,
      explanation: 'A program is a passive executable file residing on storage. A process is an active instance of a program in execution, with its own address space, PCB, and register state.'
    },
    {
      id: 'q2',
      question: 'Which of the following information is NOT stored inside a Process Control Block (PCB)?',
      options: [
        'Current process execution state',
        'The source code written by the programmer in plain text',
        'Contents of hardware registers and Program Counter',
        'Memory management bounds and open file descriptors'
      ],
      correctAnswer: 1,
      explanation: 'The PCB stores compiled runtime state (registers, state, pointers, metrics), not the original human-readable source code.'
    },
    {
      id: 'q3',
      question: 'When a running process issues an I/O request (such as reading a file from disk), what state transition occurs?',
      options: [
        'Running ➔ Ready',
        'Running ➔ Waiting (Blocked)',
        'Waiting ➔ Ready',
        'Running ➔ Terminated'
      ],
      correctAnswer: 1,
      explanation: 'A process that must wait for an external I/O device cannot utilize the CPU and transitions from Running to the Waiting (or Blocked) state.'
    },
    {
      id: 'q4',
      question: 'When an I/O device completes an operation for a waiting process, to which state does the process immediately move?',
      options: [
        'Directly to Running',
        'Ready',
        'New',
        'Terminated'
      ],
      correctAnswer: 1,
      explanation: 'When the I/O interrupt fires, the process moves to the Ready state (into the Ready Queue). It must wait for the CPU scheduler to dispatch it before it can run again.'
    },
    {
      id: 'q5',
      question: 'Why is context switching considered computational overhead by operating systems?',
      options: [
        'It requires reformatting the hard drive on each switch',
        'The CPU cannot execute useful user application work while saving and restoring state',
        'It causes memory leaks in the kernel page tables',
        'It forces all open files to be permanently deleted'
      ],
      correctAnswer: 1,
      explanation: 'During a context switch, the CPU spends cycles executing kernel code to save registers and switch address spaces. No user application progress occurs during this time.'
    },
    {
      id: 'q6',
      question: 'Which type of process is characterized by short CPU bursts and frequent, long waits for external hardware?',
      options: [
        'CPU-bound process',
        'I/O-bound process',
        'Zombie process',
        'Real-time batch process'
      ],
      correctAnswer: 1,
      explanation: 'I/O-bound processes spend the majority of their lifecycle waiting for I/O requests to complete, running for only brief CPU bursts to process or prepare data.'
    }
  ]
};
