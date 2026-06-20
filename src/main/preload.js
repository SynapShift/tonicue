const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tonicue', {
  getState: () => ipcRenderer.invoke('state:get'),
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),
  dismissOnboarding: () => ipcRenderer.invoke('onboarding:dismiss'),
  controlTimer: (action) => ipcRenderer.invoke('timer:control', action),
  focusPause: (minutes) => ipcRenderer.invoke('timer:focusPause', minutes),
  resumeNow: () => ipcRenderer.invoke('timer:resumeNow'),
  testReminder: () => ipcRenderer.invoke('reminder:test'),
  completeReminder: (reminderId) => ipcRenderer.invoke('reminder:complete', reminderId),
  snoozeReminder: (reminderId, minutes) => ipcRenderer.invoke('reminder:snooze', reminderId, minutes),
  disableReminderToday: (reminderId) => ipcRenderer.invoke('reminder:disableToday', reminderId),
  hideReminder: () => ipcRenderer.invoke('reminder:hide'),
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('state:changed', listener);
    return () => ipcRenderer.removeListener('state:changed', listener);
  },
  onReminder: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('reminder:show', listener);
    return () => ipcRenderer.removeListener('reminder:show', listener);
  },
  onReminderCompleted: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('reminder:completed', listener);
    return () => ipcRenderer.removeListener('reminder:completed', listener);
  }
});
