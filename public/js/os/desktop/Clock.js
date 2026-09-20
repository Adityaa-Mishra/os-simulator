/**
 * Clock
 * Live system tray digital clock for AdityyaOS.
 * Manages clean timer lifecycle (start, stop, destroy) to guarantee zero memory leaks.
 */

export class Clock {
  constructor(options = {}) {
    this.use24Hour = options.use24Hour ?? true;
    this.intervalId = null;
    this.element = null;
    this.timeElement = null;
    this.dateElement = null;
  }

  /**
   * Format a Date instance into standard time string.
   * @param {Date} date
   * @returns {string}
   */
  formatTime(date = new Date()) {
    if (this.use24Hour) {
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${hours}:${minutes}:${seconds}`;
    } else {
      let hours = date.getHours();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const seconds = String(date.getSeconds()).padStart(2, '0');
      return `${hours}:${minutes}:${seconds} ${ampm}`;
    }
  }

  /**
   * Format a Date instance into standard date string.
   * @param {Date} date
   * @returns {string}
   */
  formatDate(date = new Date()) {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const dayName = days[date.getDay()];
    const monthName = months[date.getMonth()];
    const dayNum = date.getDate();
    const year = date.getFullYear();
    return `${dayName}, ${monthName} ${dayNum}, ${year}`;
  }

  /**
   * Mount and start the clock interval on a DOM container.
   * @param {HTMLElement} containerElement
   */
  start(containerElement) {
    this.stop(); // Clear any existing interval

    this.element = containerElement;
    if (this.element) {
      this.element.innerHTML = `
        <div class="os-clock-widget" title="${this.formatDate()}">
          <span class="os-clock-time">${this.formatTime()}</span>
          <span class="os-clock-date">${this.formatDate()}</span>
        </div>
      `;
      this.timeElement = this.element.querySelector('.os-clock-time');
      this.dateElement = this.element.querySelector('.os-clock-date');
    }

    this.update();
    this.intervalId = setInterval(() => this.update(), 1000);
  }

  /**
   * Tick update.
   */
  update() {
    const now = new Date();
    const timeStr = this.formatTime(now);
    const dateStr = this.formatDate(now);

    if (this.timeElement) {
      this.timeElement.textContent = timeStr;
    }
    if (this.dateElement) {
      this.dateElement.textContent = dateStr;
    }
    if (this.element) {
      this.element.setAttribute('title', dateStr);
    }
  }

  /**
   * Stop clock timer and release references.
   */
  stop() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.timeElement = null;
    this.dateElement = null;
    this.element = null;
  }

  /**
   * Alias for stop().
   */
  destroy() {
    this.stop();
  }
}
