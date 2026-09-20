/**
 * AdityyaOS Core Architecture Public Gateway
 * Exports the Kernel class, singleton kernel instance, event emitter, state, and managers.
 */

export { Kernel, kernel } from './kernel/Kernel.js';
export { OSEventEmitter, OSEvents } from './kernel/OSEventEmitter.js';
export { OSState, SystemStatus } from './kernel/OSState.js';
export { ProcessManager, ProcessState } from './kernel/ProcessManager.js';
export { SchedulerManager, SchedulerAlgorithm } from './kernel/SchedulerManager.js';
export { MemoryManager, MemoryStrategy } from './kernel/MemoryManager.js';
export { FileSystemManager } from './kernel/FileSystemManager.js';
export { DiskManager, DiskAlgorithm } from './kernel/DiskManager.js';
export { ResourceManager } from './kernel/ResourceManager.js';
export { SystemCalls } from './kernel/SystemCalls.js';

// Phase 13: Desktop Environment Exports
export { DesktopEnvironment } from './desktop/DesktopEnvironment.js';
export { Taskbar } from './desktop/Taskbar.js';
export { Launcher, SYSTEM_APPLICATIONS } from './desktop/Launcher.js';
export { SystemTray } from './desktop/SystemTray.js';
export { Notifications } from './desktop/Notifications.js';
export { Clock } from './desktop/Clock.js';
export { SessionManager } from './desktop/SessionManager.js';
export { DesktopSearch } from './desktop/DesktopSearch.js';

// Phase 14: Window Manager & Shell Exports
export { WindowManager } from './shell/WindowManager.js';
export { Window } from './shell/Window.js';
export { WindowModel, WindowState } from './shell/WindowState.js';
export { WindowEvents } from './shell/WindowEvents.js';
export { ApplicationRegistry } from './shell/ApplicationRegistry.js';
export { Shell } from './shell/Shell.js';

// Phase 15: Virtual Hardware Exports
export { HardwareManager } from './hardware/HardwareManager.js';
export { HardwareBus, ALLOWED_BUS_OPERATIONS } from './hardware/HardwareBus.js';
export { HardwareDevice } from './hardware/HardwareDevice.js';
export { CPUDevice } from './hardware/CPUDevice.js';
export { MemoryDevice } from './hardware/MemoryDevice.js';
export { StorageDevice } from './hardware/StorageDevice.js';
export { InputDevice } from './hardware/InputDevice.js';
export { DisplayDevice } from './hardware/DisplayDevice.js';
export { ClockDevice } from './hardware/ClockDevice.js';
export {
  DeviceStatus,
  DeviceType,
  DEFAULT_HARDWARE_PROFILE
} from './hardware/HardwareState.js';
// Phase 17: Filesystem Subsystem Exports
export {
  FileSystem,
  File,
  Directory,
  Inode,
  FileDescriptor,
  PathResolver,
  FileSystemStatus,
  FileSystemErrorCode,
  FileSystemEvents,
  createFsError
} from './filesystem/index.js';

// Phase 18: Terminal & Shell Exports
export {
  Terminal,
  TerminalView,
  TerminalState,
  Shell as TerminalShell,
  ShellParser,
  CommandRegistry,
  CommandContext,
  CommandHistory,
  TerminalEvents
} from './terminal/index.js';

// Phase 19: AdityyaOS API Exports
export {
  AdityyaOSAPI,
  APIContext,
  APIError,
  APIEvents,
  SystemAPI,
  ProcessAPI,
  FileSystemAPI,
  MemoryAPI,
  EventAPI,
  WindowAPI,
  ApplicationAPI,
  NetworkAPI,
  AIAPI,
  AIControlAPI,
  ProfileAPI,
  ExperimentAPI,
  CloudAPI
} from './api/index.js';

// Phase 20: Application Runtime Exports
export {
  ApplicationRuntime,
  ApplicationLoader,
  ApplicationValidator,
  ApplicationState,
  isValidApplicationTransition,
  VALID_APPLICATION_TRANSITIONS,
  ApplicationInstance,
  ApplicationContext,
  RuntimeEvents
} from './runtime/index.js';

// Phase 21: Application Packaging & Permissions Exports
export {
  PackagePermissions,
  ALL_PERMISSIONS,
  isValidPermission,
  PackageError,
  AppManifest,
  AppPackage,
  PackageValidator,
  PackageBuilder,
  PackageParser,
  PackageRegistry
} from './packages/index.js';

// Phase 22: Adityya Store Exports
export {
  StoreService,
  StoreCatalog,
  StoreApp,
  StoreRepository,
  StoreError,
  StoreEvents
} from './store/index.js';

// Phase 23 & 24: Native Applications & Web Browser Exports
export {
  filesApp,
  terminalApp,
  notesApp,
  calculatorApp,
  textEditorApp,
  imageViewerApp,
  settingsApp,
  taskManagerApp,
  systemMonitorApp,
  browserApp,
  NATIVE_APPLICATIONS,
  registerNativeApplications
} from './apps/index.js';

// Phase 25: Networking Subsystem Exports
export {
  NetworkManager,
  NetworkState,
  NetworkInterface,
  InterfaceStatus,
  VirtualNetworkAdapter,
  Packet,
  RoutingTable,
  ipToInt,
  netmaskToPrefixLen,
  ArpTable,
  DnsResolver,
  Socket,
  SocketState
} from './network/index.js';

// Phase 26: AI Core Subsystem Exports
export {
  AICore,
  AIProvider,
  MockAIProvider,
  AIRequest,
  AIResponse,
  AIContext,
  AISession
} from './ai/index.js';

// Phase 27: AI OS Control Exports
export {
  AIAction,
  ActionState,
  ActionRisk,
  AIApprovalRequest,
  ApprovalStatus,
  AIActionPolicy,
  AIToolRegistry,
  AIActionExecutor,
  AIControlService,
  AIControlServicePort,
  AIControlEvents
} from './ai-control/index.js';

// Phase 28: AI Developer Tools Exports
export {
  AIDeveloperTools,
  AITerminalHandler
} from './ai-tools/index.js';

// Phase 29: OS Experiments / Sandbox Exports
export {
  Experiment,
  ExperimentManager,
  ExperimentState,
  isValidExperimentTransition,
  VALID_EXPERIMENT_TRANSITIONS,
  ExperimentError,
  ExperimentPolicy,
  ExperimentSnapshot,
  ExperimentDiff,
  ExperimentServicePort
} from './experiments/index.js';

// Phase 30: User Profiles & Cloud State Exports
export {
  UserProfile,
  ProfileManager,
  ProfileState,
  validateUsername,
  ProfileError,
  ProfilePolicy,
  ProfileServicePort
} from './profiles/index.js';

export {
  CloudSnapshot,
  MockCloudStateProvider,
  CloudStateError,
  CloudSyncService,
  CloudServicePort
} from './cloud/index.js';


