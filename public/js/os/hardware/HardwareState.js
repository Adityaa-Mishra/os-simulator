/**
 * HardwareState
 * Virtual Hardware definitions, device types, statuses, profiles, and state models for AdityyaOS.
 * Purely simulated hardware layer; does not access any real physical hardware.
 */

export const DeviceStatus = Object.freeze({
  OFFLINE: 'OFFLINE',
  INITIALIZING: 'INITIALIZING',
  READY: 'READY',
  BUSY: 'BUSY',
  ERROR: 'ERROR',
  DISABLED: 'DISABLED'
});

export const DeviceType = Object.freeze({
  CPU: 'cpu',
  MEMORY: 'memory',
  STORAGE: 'storage',
  INPUT: 'input',
  DISPLAY: 'display',
  CLOCK: 'clock'
});

/**
 * Standard default virtual hardware profile for AdityyaOS.
 */
export const DEFAULT_HARDWARE_PROFILE = Object.freeze({
  cpu: {
    id: 'cpu0',
    name: 'Adityya-64 Virtual Processor',
    vendor: 'AdityyaOS Virtual Silicon',
    model: 'A64-Sim',
    cores: 1,
    frequencyMHz: 2400,
    architecture: 'Adityya64'
  },
  memory: {
    id: 'ram0',
    name: 'Virtual Main Memory',
    vendor: 'AdityyaOS Memory Corp',
    model: 'DDR4-VRAM',
    totalBytes: 1024
  },
  storage: {
    id: 'disk0',
    name: 'Virtual Primary Drive',
    vendor: 'AdityyaOS Storage Systems',
    model: 'NVMe-VDisk',
    capacityBytes: 524288, // 512 KB simulated capacity
    sectorSize: 512,
    totalCylinders: 1024
  },
  display: {
    id: 'display0',
    name: 'Virtual Framebuffer Display',
    vendor: 'AdityyaOS Graphics Display',
    model: 'VDisplay-1080p',
    width: 1920,
    height: 1080,
    refreshRate: 60,
    colorDepth: 24
  },
  input: {
    id: 'input0',
    name: 'Virtual HID Controller',
    vendor: 'AdityyaOS Generic HID',
    model: 'VHID-Combo'
  },
  clock: {
    id: 'clock0',
    name: 'Real-Time Clock & APIC Timer',
    vendor: 'AdityyaOS System Timer',
    model: 'RTC-Sim',
    frequencyHz: 1000
  }
});
