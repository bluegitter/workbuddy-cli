'use strict';

class DefaultNotifier {
  async info(message, messageArgs) { console.info(this.formatMessage(message, messageArgs)); }
  async infoAction(message, messageArgs) { console.info(this.formatMessage(message, messageArgs)); }
  async warn(message, messageArgs) { console.warn(this.formatMessage(message, messageArgs)); }
  async error(message, messageArgs) { console.error(this.formatMessage(message, messageArgs)); }

  formatMessage(message, messageArgs) {
    if (!Array.isArray(messageArgs) || messageArgs.length === 0) return message;
    let formatted = String(message);
    messageArgs.forEach((arg, index) => { formatted = formatted.replace(`{${index}}`, String(arg)); });
    return formatted;
  }

  async sendSystemNotification(options) { console.info('sendSystemNotification', options); }
}

module.exports = { DefaultNotifier, Notifier: Symbol.for('workbuddy.runtime.Notifier') };
