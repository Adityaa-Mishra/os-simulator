/**
 * HardwareBus
 * Structured communication abstraction between Kernel/Subsystems and Virtual Hardware Devices.
 * Enforces structured request/response semantics, explicit operation allowlists,
 * parameter validation, and robust error isolation.
 */

export const ALLOWED_BUS_OPERATIONS = Object.freeze({
  cpu: ['executeWorkload', 'setUtilization', 'assignProcess', 'releaseProcess', 'getState'],
  memory: ['allocate', 'release', 'read', 'write', 'getState'],
  storage: ['read', 'write', 'seek', 'getState'],
  input: ['sendInput', 'getRecentEvents', 'getState'],
  display: ['setResolution', 'getResolution', 'getState'],
  clock: ['getTime', 'getTicks', 'tick', 'getState']
});

export class HardwareBus {
  /**
   * @param {import('./HardwareManager.js').HardwareManager} hardwareManager
   */
  constructor(hardwareManager) {
    this.hardwareManager = hardwareManager;
  }

  /**
   * Dispatch a structured request to a hardware device across the bus.
   * @param {string} deviceId
   * @param {string} operation
   * @param {*} [payload={}]
   * @returns {{ success: boolean, data?: any, error?: string }}
   */
  request(deviceId, operation, payload = {}) {
    if (typeof deviceId !== 'string' || !deviceId.trim()) {
      return { success: false, error: 'Device ID must be a non-empty string' };
    }

    if (typeof operation !== 'string' || !operation.trim()) {
      return { success: false, error: 'Hardware operation must be a non-empty string' };
    }

    const device = this.hardwareManager.getDevice(deviceId.trim());
    if (!device) {
      return { success: false, error: `Device "${deviceId}" not found on hardware bus` };
    }

    if (!device.enabled) {
      return { success: false, error: `Device "${deviceId}" is disabled` };
    }

    const allowedOps = ALLOWED_BUS_OPERATIONS[device.type] || [];
    if (!allowedOps.includes(operation)) {
      return {
        success: false,
        error: `Operation "${operation}" is not permitted on device type "${device.type}" (allowed: ${allowedOps.join(', ')})`
      };
    }

    if (typeof device[operation] !== 'function') {
      return {
        success: false,
        error: `Device "${deviceId}" does not implement operation "${operation}"`
      };
    }

    try {
      let result;
      // Distinguish methods by parameter count / expectation
      if (operation === 'read' || operation === 'write' || operation === 'seek' || operation === 'setResolution' || operation === 'allocate') {
        if (operation === 'allocate') {
          result = device.allocate(payload?.pid, payload?.size);
        } else if (operation === 'read') {
          result = device.read(payload?.address ?? payload?.sector, payload?.length);
        } else if (operation === 'write') {
          result = device.write(payload?.address ?? payload?.sector, payload?.data);
        } else if (operation === 'seek') {
          result = device.seek(payload?.cylinder);
        } else if (operation === 'setResolution') {
          result = device.setResolution(payload?.width, payload?.height);
        }
      } else if (operation === 'setUtilization') {
        result = device.setUtilization(payload?.utilization ?? payload);
      } else if (operation === 'assignProcess') {
        result = device.assignProcess(payload?.pid ?? payload);
      } else if (operation === 'releaseProcess') {
        result = device.releaseProcess();
      } else if (operation === 'sendInput') {
        result = device.sendInput(payload);
      } else if (operation === 'tick') {
        result = device.tick(payload?.count);
      } else if (operation === 'executeWorkload') {
        result = device.executeWorkload(payload);
      } else if (operation === 'getState') {
        result = { success: true, data: device.getState() };
      } else if (operation === 'getResolution') {
        result = { success: true, data: device.getResolution() };
      } else if (operation === 'getRecentEvents') {
        result = { success: true, data: device.getRecentEvents() };
      } else if (operation === 'getTime') {
        result = { success: true, data: { time: device.getTime() } };
      } else if (operation === 'getTicks') {
        result = { success: true, data: { ticks: device.getTicks() } };
      } else {
        result = device[operation](payload);
      }

      // Standardize result shape
      if (result && typeof result === 'object' && result.success !== undefined) {
        return result;
      }
      return { success: true, data: result };
    } catch (err) {
      return {
        success: false,
        error: `Hardware bus error executing "${operation}" on "${deviceId}": ${err.message}`
      };
    }
  }
}
