/**
 * public/js/os/api/AdityyaOSAPI.js
 * Master facade providing controlled AdityyaOS APIs to an application instance.
 * Assembles SystemAPI, ProcessAPI, FileSystemAPI, MemoryAPI, EventAPI, WindowAPI, and ApplicationAPI.
 */

import { SystemAPI } from './SystemAPI.js';
import { ProcessAPI } from './ProcessAPI.js';
import { FileSystemAPI } from './FileSystemAPI.js';
import { MemoryAPI } from './MemoryAPI.js';
import { EventAPI } from './EventAPI.js';
import { WindowAPI } from './WindowAPI.js';
import { ApplicationAPI } from './ApplicationAPI.js';
import { NetworkAPI } from './NetworkAPI.js';
import { AIAPI } from './AIAPI.js';
import { AIControlAPI } from './AIControlAPI.js';
import { ProfileAPI } from './ProfileAPI.js';
import { ExperimentAPI } from './ExperimentAPI.js';
import { CloudAPI } from './CloudAPI.js';

export class AdityyaOSAPI {
  /**
   * @param {Object} options
   * @param {import('../kernel/Kernel.js').Kernel} options.kernel
   * @param {import('./APIContext.js').APIContext} options.context
   * @param {import('../shell/WindowManager.js').WindowManager} [options.windowManager]
   * @param {import('../shell/WindowState.js').WindowModel} [options.windowModel]
   * @param {import('../runtime/ApplicationRuntime.js').ApplicationRuntime} [options.runtime]
   */
  constructor({
    kernel,
    context,
    windowManager = null,
    windowModel = null,
    runtime = null
  }) {
    if (!kernel) {
      throw new TypeError('AdityyaOSAPI requires a kernel instance');
    }
    if (!context) {
      throw new TypeError('AdityyaOSAPI requires an APIContext instance');
    }

    this.context = context;
    this.system = new SystemAPI({ kernel, context });
    this.process = new ProcessAPI({ kernel, context });
    this.fs = new FileSystemAPI({ kernel, context });
    this.memory = new MemoryAPI({ kernel, context });
    this.events = new EventAPI({ events: kernel.events, context });
    this.window = windowModel ? new WindowAPI({ windowManager, windowModel, context }) : null;
    this.app = new ApplicationAPI({ runtime, context });
    this.network = new NetworkAPI({ kernel, context });
    this.ai = new AIAPI({ kernel, context });
    const aiControlPort = kernel.aiControlService ? kernel.aiControlService.getPort() : null;
    this.aiControl = new AIControlAPI({ servicePort: aiControlPort, context, apiFacade: this });

    // Phase 29 & 30: Profiles, Experiments, and Cloud
    const profilePort = kernel.profileManager ? kernel.profileManager.getPort() : null;
    this.profile = profilePort ? new ProfileAPI({ servicePort: profilePort, context }) : null;

    const experimentPort = kernel.experimentManager ? kernel.experimentManager.getPort() : null;
    this.experiments = experimentPort ? new ExperimentAPI({ servicePort: experimentPort, context }) : null;

    const cloudPort = kernel.cloudSyncService ? kernel.cloudSyncService.getPort() : null;
    this.cloud = cloudPort ? new CloudAPI({ servicePort: cloudPort, context }) : null;
  }

  /**
   * Clean up all per-instance resources and event listeners upon termination.
   */
  destroy() {
    if (this.events && typeof this.events.destroy === 'function') {
      this.events.destroy();
    }
    if (this.network && typeof this.network.destroy === 'function') {
      this.network.destroy();
    }
    if (this.ai && typeof this.ai.destroy === 'function') {
      this.ai.destroy();
    }
    if (this.aiControl && typeof this.aiControl.destroy === 'function') {
      this.aiControl.destroy();
    }
  }

}
