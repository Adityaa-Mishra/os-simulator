import { describe, it, expect, beforeEach } from 'vitest';
import { Kernel } from '../../../public/js/os/kernel/Kernel.js';
import { APIContext } from '../../../public/js/os/api/APIContext.js';
import { AdityyaOSAPI } from '../../../public/js/os/api/AdityyaOSAPI.js';
import { PackagePermissions } from '../../../public/js/os/packages/PackagePermissions.js';
import { WindowManager } from '../../../public/js/os/shell/WindowManager.js';
import { ApplicationRuntime } from '../../../public/js/os/runtime/ApplicationRuntime.js';

describe('Phase 30 — User Profiles Lifecycle & API', () => {
  let kernel;

  beforeEach(() => {
    kernel = new Kernel();
    kernel.boot();
    kernel.windowManager = new WindowManager({ events: kernel.events });
    kernel.runtime = new ApplicationRuntime({ kernel, windowManager: kernel.windowManager });
  });

  it('boots with default user profile "user" and /home/user directory', () => {
    const current = kernel.profileManager.getCurrentProfile();
    expect(current).toBeDefined();
    expect(current.username).toBe('user');
    expect(current.homeDirectory).toBe('/home/user');
    expect(kernel.fileSystemManager.exists('/home/user')).toBe(true);
  });

  it('enforces profile.read permission on getCurrent() and list()', () => {
    const unpermittedContext = new APIContext({
      appId: 'unpermitted-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: []
    });
    const apiNoPerm = new AdityyaOSAPI({ kernel, context: unpermittedContext });

    expect(() => apiNoPerm.profile.getCurrent()).toThrowError(/Permission denied.*profile\.read/);
    expect(() => apiNoPerm.profile.list()).toThrowError(/Permission denied.*profile\.read/);

    const permittedContext = new APIContext({
      appId: 'permitted-app',
      instanceId: 'inst-2',
      pid: 11,
      permissions: [PackagePermissions.PROFILE_READ]
    });
    const apiPerm = new AdityyaOSAPI({ kernel, context: permittedContext });

    const current = apiPerm.profile.getCurrent();
    expect(current.username).toBe('user');
    const list = apiPerm.profile.list();
    expect(list.length).toBe(1);
    expect(list[0].username).toBe('user');
  });

  it('enforces profile.write permission on create() and validates username', () => {
    const readOnlyContext = new APIContext({
      appId: 'reader',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.PROFILE_READ]
    });
    const apiReadOnly = new AdityyaOSAPI({ kernel, context: readOnlyContext });

    expect(() => apiReadOnly.profile.create({ username: 'alice' })).toThrowError(/Permission denied.*profile\.write/);

    const writeContext = new APIContext({
      appId: 'writer',
      instanceId: 'inst-2',
      pid: 11,
      permissions: [PackagePermissions.PROFILE_READ, PackagePermissions.PROFILE_WRITE]
    });
    const apiWrite = new AdityyaOSAPI({ kernel, context: writeContext });

    // Invalid usernames
    expect(() => apiWrite.profile.create({ username: '' })).toThrowError(/non-empty string/);
    expect(() => apiWrite.profile.create({ username: 'root' })).toThrowError(/reserved/);
    expect(() => apiWrite.profile.create({ username: 'system' })).toThrowError(/reserved/);
    expect(() => apiWrite.profile.create({ username: 'Invalid Username!' })).toThrowError(/can only contain alphanumeric/);

    // Valid profile creation
    const created = apiWrite.profile.create({
      username: 'alice',
      displayName: 'Alice Developer',
      preferences: { theme: 'light' }
    });

    expect(created.username).toBe('alice');
    expect(created.homeDirectory).toBe('/home/alice');
    expect(kernel.fileSystemManager.exists('/home/alice')).toBe(true);

    // Duplicate username rejected
    expect(() => apiWrite.profile.create({ username: 'alice' })).toThrowError(/already exists/);
  });

  it('manages user preferences with getPreferences() and updatePreferences()', () => {
    const context = new APIContext({
      appId: 'pref-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.PROFILE_READ, PackagePermissions.PROFILE_WRITE]
    });
    const api = new AdityyaOSAPI({ kernel, context });

    const initialPrefs = api.profile.getPreferences();
    expect(initialPrefs.theme).toBe('dark');

    const updated = api.profile.updatePreferences({ theme: 'high-contrast', fontSize: 14 });
    expect(updated.theme).toBe('high-contrast');
    expect(updated.fontSize).toBe(14);
    expect(updated.wallpaper).toBe('default.png');
  });

  it('handles safe profile switching with approval gating and selective process termination', () => {
    // 1. Create second profile 'bob'
    kernel.profileManager.createProfile({ username: 'bob', displayName: 'Bob Analyst' });

    // 2. Spawn init process (PID 1) and user processes (PID 2, 3)
    const pInit = kernel.processManager.createProcess({ name: 'init' });
    const p1 = kernel.processManager.createProcess({ name: 'user-app-1', username: 'user', profileId: 'default' });
    const p2 = kernel.processManager.createProcess({ name: 'user-app-2', username: 'user', profileId: 'default' });
    expect(pInit.data.pid).toBe(1);
    const pid1 = p1.data.pid;
    const pid2 = p2.data.pid;
    expect(pid1).toBeGreaterThan(1);
    expect(pid2).toBeGreaterThan(1);

    const context = new APIContext({
      appId: 'switch-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.PROFILE_READ, PackagePermissions.PROFILE_SWITCH]
    });
    const api = new AdityyaOSAPI({ kernel, context });

    // 3. Request switch to bob
    const request = api.profile.switch('bob');
    expect(request.approvalId).toBeDefined();
    expect(request.status).toBe('PENDING');
    expect(request.requiresApproval).toBe(true);
    expect(request.targetUsername).toBe('bob');

    // 4. Approve switch
    const approveResult = api.profile.approveSwitch(request.approvalId);
    expect(approveResult.success).toBe(true);
    expect(approveResult.activeProfile.username).toBe('bob');

    // 5. Verify active profile switched
    expect(kernel.profileManager.activeUsername).toBe('bob');

    // 6. Verify outgoing user's processes were terminated, while system processes are untouched
    const procInit = kernel.processManager.getProcess(1);
    const proc1 = kernel.processManager.getProcess(pid1);
    const proc2 = kernel.processManager.getProcess(pid2);
    expect(procInit.state).not.toBe('TERMINATED'); // Init is preserved
    expect(proc1.state).toBe('TERMINATED');
    expect(proc2.state).toBe('TERMINATED');

    // Single-use approval: cannot approve again
    expect(() => api.profile.approveSwitch(request.approvalId)).toThrowError();
  });


  it('supports denying profile switch requests', () => {
    kernel.profileManager.createProfile({ username: 'charlie' });

    const context = new APIContext({
      appId: 'switch-app',
      instanceId: 'inst-1',
      pid: 10,
      permissions: [PackagePermissions.PROFILE_READ, PackagePermissions.PROFILE_SWITCH]
    });
    const api = new AdityyaOSAPI({ kernel, context });

    const request = api.profile.switch('charlie');
    const denyResult = api.profile.denySwitch(request.approvalId, 'Cancelled by user');

    expect(denyResult.status).toBe('DENIED');
    expect(denyResult.reason).toBe('Cancelled by user');
    expect(kernel.profileManager.activeUsername).toBe('user');
  });

  it('resets cleanly upon kernel.reset()', () => {
    kernel.profileManager.createProfile({ username: 'david' });
    expect(kernel.profileManager.profiles.size).toBe(2);

    kernel.reset();

    expect(kernel.profileManager.profiles.size).toBe(1);
    expect(kernel.profileManager.activeUsername).toBe('user');
  });

  it('completely cleans up outgoing profile resources (windows, descriptors, sockets, AI sessions, approvals, runtimes) during profile switch', async () => {
    // Setup target profile 'eve'
    kernel.profileManager.createProfile({ username: 'eve', displayName: 'Eve Analyst' });

    // Spawn init (PID 1)
    const pInit = kernel.processManager.createProcess({ name: 'init' });
    expect(pInit.data.pid).toBe(1);

    // Outgoing user process and target profile process
    const procUser = kernel.processManager.createProcess({ name: 'user-task', username: 'user', profileId: 'default' });
    const pidUser = procUser.data.pid;
    expect(pidUser).toBeGreaterThan(1);

    const procEve = kernel.processManager.createProcess({ name: 'eve-task', username: 'eve', profileId: 'profile-eve' });
    const pidEve = procEve.data.pid;
    expect(pidEve).toBeGreaterThan(1);

    // 1. File descriptor for outgoing user process
    kernel.fileSystemManager.createFile('/home/user/openfile.txt', 'hello');
    const openRes = kernel.fileSystemManager.openDescriptor('/home/user/openfile.txt', 'r', pidUser);
    expect(openRes.success).toBe(true);
    const fd = openRes.data.fd;

    // 2. Network socket for outgoing user process and target process
    const sockUser = kernel.networkManager.createSocket({ pid: pidUser, protocol: 'TCP' });
    const sockEve = kernel.networkManager.createSocket({ pid: pidEve, protocol: 'TCP' });
    expect(kernel.networkManager.sockets.has(sockUser.id)).toBe(true);
    expect(kernel.networkManager.sockets.has(sockEve.id)).toBe(true);

    // 3. AI session for outgoing user process
    const aiSession = kernel.aiCore.createSession({ pid: pidUser });
    expect(kernel.aiCore.activeSessions.has(aiSession.id)).toBe(true);

    // 4. AI action and approval for outgoing user process
    const userContext = new APIContext({
      appId: 'user-task',
      instanceId: 'inst-user',
      pid: pidUser,
      username: 'user',
      permissions: [PackagePermissions.AI_CONTROL, PackagePermissions.APPLICATION_LIFECYCLE]
    });
    const userApi = new AdityyaOSAPI({ kernel, context: userContext });
    const planResult = await userApi.aiControl.planAction('application.exitSelf', {});
    expect(planResult.requiresApproval).toBe(true);
    const approvalsBefore = Array.from(kernel.aiControlService.approvals.values()).filter(a => a.pid === pidUser);
    expect(approvalsBefore.length).toBeGreaterThan(0);

    // 5. Application runtime instance with window
    kernel.runtime.registerApplication({
      id: 'test-app',
      name: 'Test App',
      version: '1.0.0',
      entry: () => {},
      permissions: ['window.control', 'events.subscribe']
    });
    const inst = kernel.runtime.launch('test-app', { cwd: '/home/user' });
    const instPid = inst.pid;
    const winId = inst.windowModel?.id;
    expect(kernel.windowManager.getWindow(winId)).toBeDefined();

    // 6. Execute switch to 'eve'
    const switchContext = new APIContext({
      appId: 'switch-caller',
      instanceId: 'inst-sw',
      pid: 50,
      username: 'user',
      permissions: [PackagePermissions.PROFILE_READ, PackagePermissions.PROFILE_SWITCH]
    });
    const switchApi = new AdityyaOSAPI({ kernel, context: switchContext });
    const swReq = switchApi.profile.switch('eve');
    const swRes = switchApi.profile.approveSwitch(swReq.approvalId);
    expect(swRes.success).toBe(true);
    expect(kernel.profileManager.activeUsername).toBe('eve');

    // VERIFY OUTGOING PROFILE CLEANUP:
    // Outgoing processes terminated
    expect(kernel.processManager.getProcess(pidUser).state).toBe('TERMINATED');
    expect(kernel.processManager.getProcess(instPid).state).toBe('TERMINATED');

    // Target profile process preserved
    expect(kernel.processManager.getProcess(pidEve).state).not.toBe('TERMINATED');

    // File descriptors closed
    expect(kernel.fileSystemManager.fs.descriptors.has(fd)).toBe(false);

    // Sockets: user closed, eve preserved
    expect(kernel.networkManager.sockets.has(sockUser.id)).toBe(false);
    expect(kernel.networkManager.sockets.has(sockEve.id)).toBe(true);

    // AI session closed
    expect(aiSession.closed).toBe(true);
    expect(kernel.aiCore.activeSessions.has(aiSession.id)).toBe(false);

    // AI approvals cancelled
    const pendingApprovalsAfter = Array.from(kernel.aiControlService.approvals.values())
      .filter(a => a.pid === pidUser && a.status === 'PENDING');
    expect(pendingApprovalsAfter.length).toBe(0);

    const userApprovals = Array.from(kernel.aiControlService.approvals.values()).filter(a => a.pid === pidUser);
    expect(userApprovals.every(a => a.status === 'CANCELLED')).toBe(true);

    // Window closed
    expect(kernel.windowManager.getWindow(winId)).toBeNull();
  });

  it('cancels pending profile-switch approvals on owner process termination, reset, shutdown, or completed switch', () => {
    kernel.profileManager.createProfile({ username: 'frank' });
    kernel.profileManager.createProfile({ username: 'grace' });

    // 1. Cancel on owner process termination
    const ownerProc = kernel.processManager.createProcess({ name: 'switch-owner', username: 'user' });
    const ownerPid = ownerProc.data.pid;
    const ctx1 = new APIContext({
      appId: 'sw1',
      instanceId: 'i-1',
      pid: ownerPid,
      username: 'user',
      permissions: [PackagePermissions.PROFILE_READ, PackagePermissions.PROFILE_SWITCH]
    });
    const api1 = new AdityyaOSAPI({ kernel, context: ctx1 });
    const req1 = api1.profile.switch('frank');
    expect(kernel.profileManager.pendingSwitches.has(req1.approvalId)).toBe(true);

    // Terminate owner process
    kernel.processManager.terminateProcess(ownerPid);
    expect(kernel.profileManager.pendingSwitches.has(req1.approvalId)).toBe(false);

    // 2. Cancel on completed switch
    const ctx2 = new APIContext({
      appId: 'sw2',
      instanceId: 'i-2',
      pid: 60,
      username: 'user',
      permissions: [PackagePermissions.PROFILE_READ, PackagePermissions.PROFILE_SWITCH]
    });
    const api2 = new AdityyaOSAPI({ kernel, context: ctx2 });
    const req2a = api2.profile.switch('frank');

    const ctx3 = new APIContext({
      appId: 'sw3',
      instanceId: 'i-3',
      pid: 61,
      username: 'user',
      permissions: [PackagePermissions.PROFILE_READ, PackagePermissions.PROFILE_SWITCH]
    });
    const api3 = new AdityyaOSAPI({ kernel, context: ctx3 });
    const req2b = api3.profile.switch('grace');

    expect(kernel.profileManager.pendingSwitches.has(req2a.approvalId)).toBe(true);
    expect(kernel.profileManager.pendingSwitches.has(req2b.approvalId)).toBe(true);

    // Approve and execute req2a
    api2.profile.approveSwitch(req2a.approvalId);
    expect(kernel.profileManager.activeUsername).toBe('frank');

    // req2b must have been cancelled
    expect(kernel.profileManager.pendingSwitches.has(req2b.approvalId)).toBe(false);

    // 3. Cancel on shutdown / reset
    kernel.profileManager.createProfile({ username: 'helen' });
    const ctx4 = new APIContext({
      appId: 'sw4',
      instanceId: 'i-4',
      pid: 70,
      username: 'frank',
      permissions: [PackagePermissions.PROFILE_READ, PackagePermissions.PROFILE_SWITCH]
    });
    const api4 = new AdityyaOSAPI({ kernel, context: ctx4 });
    const req4 = api4.profile.switch('helen');
    expect(kernel.profileManager.pendingSwitches.has(req4.approvalId)).toBe(true);

    kernel.profileManager.shutdown();
    expect(kernel.profileManager.pendingSwitches.size).toBe(0);
  });
});
