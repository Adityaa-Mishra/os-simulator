/**
 * WindowState
 * Deterministic window model and state definitions for AdityyaOS Window Manager.
 * Serves as the authoritative source of truth for logical window properties.
 */

export const WindowState = Object.freeze({
  NORMAL: 'normal',
  MINIMIZED: 'minimized',
  MAXIMIZED: 'maximized',
  CLOSED: 'closed'
});

export class WindowModel {
  /**
   * @param {Object} config
   * @param {string} config.id - Unique window ID (e.g. 'win-1')
   * @param {string} config.appId - Application ID (e.g. 'files', 'terminal')
   * @param {string} [config.title='Window']
   * @param {string} [config.icon='📄']
   * @param {number} [config.x=100]
   * @param {number} [config.y=80]
   * @param {number} [config.width=640]
   * @param {number} [config.height=420]
   * @param {number} [config.minWidth=280]
   * @param {number} [config.minHeight=200]
   * @param {string} [config.state=WindowState.NORMAL]
   * @param {number} [config.zIndex=100]
   * @param {boolean} [config.focused=false]
   * @param {boolean} [config.visible=true]
   * @param {boolean} [config.singleton=true]
   */
  constructor({
    id,
    appId,
    title = 'Window',
    icon = '📄',
    x = 100,
    y = 80,
    width = 640,
    height = 420,
    minWidth = 280,
    minHeight = 200,
    state = WindowState.NORMAL,
    zIndex = 100,
    focused = false,
    visible = true,
    singleton = true
  }) {
    if (!id) throw new Error('WindowModel requires a unique id');
    if (!appId) throw new Error('WindowModel requires an appId');

    this.id = id;
    this.appId = appId;
    this.title = title;
    this.icon = icon;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.minWidth = minWidth;
    this.minHeight = minHeight;
    this.state = state;
    this.zIndex = zIndex;
    this.focused = focused;
    this.visible = visible;
    this.singleton = singleton;
    this.prevGeometry = null; // Stored geometry prior to maximize: { x, y, width, height }
  }

  /**
   * Return a serializable snapshot of the window state.
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      appId: this.appId,
      title: this.title,
      icon: this.icon,
      state: this.state,
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      minWidth: this.minWidth,
      minHeight: this.minHeight,
      zIndex: this.zIndex,
      focused: this.focused,
      visible: this.visible,
      singleton: this.singleton,
      prevGeometry: this.prevGeometry ? { ...this.prevGeometry } : null
    };
  }
}
