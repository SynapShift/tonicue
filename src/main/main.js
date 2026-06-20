const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, powerMonitor, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const {
  REMINDERS,
  clearExpiredFocusPause: clearExpiredFocusPauseInState,
  createInitialState,
  formatRemaining,
  getNextReminderSnapshot: getNextReminderSnapshotFromState,
  getReminderSettings: getReminderSettingsFromState,
  isFocusPaused: isFocusPausedInState,
  mergeState,
  resetDailyStatsIfNeeded: resetDailyStatsInStateIfNeeded,
  scheduleReminder: scheduleReminderInState,
  tickReminderCountdowns: tickReminderCountdownsInState
} = require('./reminder-core');

const isMac = process.platform === 'darwin';
const isWindows = process.platform === 'win32';
const IDLE_THRESHOLD_SECONDS = 5 * 60;

app.setName('Tonicue 瞳休');

let mainWindow;
let reminderWindow;
let tray;
let tickTimer;
let lastTickAt = Date.now();
let state;
let lastShownReminderId = null;
let isSystemAvailable = true;
let skipNextTick = false;

function getStatePath() {
  return path.join(app.getPath('userData'), 'tonicue-state.json');
}

function getAssetPath(fileName) {
  return path.join(__dirname, '../assets', fileName);
}

function loadState() {
  try {
    const raw = fs.readFileSync(getStatePath(), 'utf8');
    const saved = JSON.parse(raw);
    state = mergeState(saved);
  } catch {
    state = createInitialState();
  }

  resetDailyStatsIfNeeded();
  applyLaunchAtStartup();
}

function saveState() {
  fs.mkdirSync(path.dirname(getStatePath()), { recursive: true });
  fs.writeFileSync(getStatePath(), JSON.stringify(state, null, 2));
}

function resetDailyStatsIfNeeded() {
  if (resetDailyStatsInStateIfNeeded(state)) {
    saveState();
  }
}

function createWindows() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 920,
    minHeight: 620,
    title: 'Tonicue 瞳休',
    backgroundColor: '#fff8ef',
    show: false,
    autoHideMenuBar: true,
    icon: getAssetPath(isWindows ? 'icon.ico' : 'icon.png'),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
    query: { view: 'main' }
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('show', () => {
    if (isMac) {
      app.dock.show();
    }
  });
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (isMac) {
        app.dock.hide();
      }
    }
  });

  reminderWindow = new BrowserWindow({
    width: 360,
    height: 364,
    resizable: false,
    frame: false,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#fff8ef',
    autoHideMenuBar: true,
    icon: getAssetPath(isWindows ? 'icon.ico' : 'icon.png'),
    titleBarStyle: isMac ? 'hidden' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js')
    }
  });

  reminderWindow.loadFile(path.join(__dirname, '../renderer/index.html'), {
    query: { view: 'reminder' }
  });
  reminderWindow.setAlwaysOnTop(true, 'screen-saver');
}

function createTray() {
  if (tray) {
    updateTrayMenu();
    return;
  }

  const icon = nativeImage.createFromPath(getAssetPath('icon.png'));
  const trayIcon = isMac ? icon.resize({ width: 18, height: 18 }) : icon.resize({ width: 16, height: 16 });
  if (isMac) {
    trayIcon.setTemplateImage(true);
  }

  tray = new Tray(trayIcon);
  tray.setToolTip('Tonicue 瞳休');
  updateTrayMenu();
  tray.on('double-click', showMainWindow);
  tray.on('click', () => {
    if (isMac) {
      showMainWindow();
    }
  });
}

function updateTrayMenu() {
  if (!tray) {
    return;
  }

  const nextReminder = getNextReminderSnapshot();
  const focusPaused = isFocusPaused();
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: focusPaused
          ? `专注暂停中，${formatRemaining((state.settings.focusPauseUntil - Date.now()) / 1000)}后恢复`
          : state.settings.isRunning ? '正在守护你的盯屏时间' : '提醒已暂停',
        enabled: false
      },
      {
        label: nextReminder
          ? `下次：${nextReminder.shortTitle}，${formatRemaining(nextReminder.nextDueInSeconds)}后`
          : '下次：暂无启用提醒',
        enabled: false
      },
      { type: 'separator' },
      {
        label: '打开瞳休',
        click: () => showMainWindow()
      },
      {
        label: state.settings.isRunning ? '暂停提醒' : '继续提醒',
        click: () => toggleTimer()
      },
      focusPaused
        ? {
          label: '立即恢复提醒',
          click: () => resumeNow()
        }
        : {
          label: '专注暂停 30 分钟',
          click: () => focusPause(30)
        },
      {
        label: '测试提醒',
        click: () => showTestReminder()
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          quitApp();
        }
      }
    ])
  );
}

function showMainWindow() {
  if (!mainWindow) {
    return;
  }
  mainWindow.show();
  if (isMac) {
    app.dock.show();
  }
  mainWindow.focus();
  broadcastState();
}

function showReminderWindow(reminder) {
  if (!reminderWindow) {
    return;
  }

  reminderWindow.webContents.send('reminder:show', {
    reminder,
    stats: state.stats,
    soundEnabled: state.settings.soundEnabled
  });
  positionReminderWindow();
  reminderWindow.show();
  reminderWindow.setAlwaysOnTop(true, 'screen-saver');
  if (isMac) {
    reminderWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  reminderWindow.moveTop();
  reminderWindow.focus();
}

function positionReminderWindow() {
  if (!reminderWindow) {
    return;
  }
  const margin = 18;
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  const [windowWidth, windowHeight] = reminderWindow.getSize();
  reminderWindow.setPosition(
    Math.round(x + width - windowWidth - margin),
    Math.round(y + height - windowHeight - margin)
  );
}

function showTestReminder() {
  const reminder = state.reminders.find((item) => getReminderSettings(item.id).enabled) || state.reminders[0];
  showReminderWindow({
    ...reminder,
    title: '测试提醒来啦',
    message: '这是一个预览弹窗。真正到点时，瞳休也会这样跳到最前面。'
  });
}

function startTicker() {
  lastTickAt = Date.now();
  tickTimer = setInterval(tick, 1000);
}

function registerPowerEvents() {
  powerMonitor.on('suspend', () => markSystemUnavailable());
  powerMonitor.on('lock-screen', () => markSystemUnavailable());
  powerMonitor.on('resume', () => markSystemAvailable());
  powerMonitor.on('unlock-screen', () => markSystemAvailable());
  powerMonitor.on('user-did-resign-active', () => markSystemUnavailable());
  powerMonitor.on('user-did-become-active', () => markSystemAvailable());
}

function markSystemUnavailable() {
  isSystemAvailable = false;
  lastTickAt = Date.now();
  skipNextTick = true;
  broadcastState();
}

function markSystemAvailable() {
  isSystemAvailable = true;
  lastTickAt = Date.now();
  skipNextTick = true;
  broadcastState();
}

function tick() {
  resetDailyStatsIfNeeded();
  clearExpiredFocusPause();

  const now = Date.now();
  if (skipNextTick) {
    lastTickAt = now;
    skipNextTick = false;
    broadcastState();
    return;
  }

  const deltaSeconds = Math.max(1, Math.min(10, Math.floor((now - lastTickAt) / 1000)));
  lastTickAt = now;

  const idleState = powerMonitor.getSystemIdleState(IDLE_THRESHOLD_SECONDS);
  const isActivelyUsingScreen = state.settings.isRunning && !isFocusPaused() && isSystemAvailable && idleState === 'active';
  if (isActivelyUsingScreen) {
    state.stats.totalScreenSeconds += deltaSeconds;
    state.stats.currentSessionSeconds += deltaSeconds;
    state.stats.longestSessionSeconds = Math.max(
      state.stats.longestSessionSeconds,
      state.stats.currentSessionSeconds
    );
    tickReminderCountdowns(deltaSeconds);
  }

  const dueReminder = state.reminders.find((reminder) => {
    const settings = getReminderSettings(reminder.id);
    return state.settings.isRunning && !isFocusPaused() && settings.enabled && !reminder.disabledToday && reminder.nextDueInSeconds <= 0;
  });

  if (dueReminder && !reminderWindow.isVisible() && lastShownReminderId !== dueReminder.id) {
    lastShownReminderId = dueReminder.id;
    showReminderWindow(dueReminder);
  }

  broadcastState();

  if (now % 15000 < 1000) {
    saveState();
  }
}

function tickReminderCountdowns(deltaSeconds) {
  tickReminderCountdownsInState(state, deltaSeconds);
}

function getReminderSettings(reminderId) {
  return getReminderSettingsFromState(state, reminderId);
}

function scheduleReminder(reminderId, minutes) {
  const didSchedule = scheduleReminderInState(state, reminderId, minutes);
  if (didSchedule && lastShownReminderId === reminderId) {
    lastShownReminderId = null;
  }
}

function completeReminder(reminderId) {
  const completedReminder = state.reminders.find((reminder) => reminder.id === reminderId);
  state.stats.completedBreaks += 1;
  state.stats.currentSessionSeconds = 0;
  for (const reminder of state.reminders) {
    const settings = getReminderSettings(reminder.id);
    if (settings.enabled && !reminder.disabledToday) {
      scheduleReminder(reminder.id, settings.intervalMinutes);
    }
  }
  showCompletionFeedback(completedReminder);
  saveAndBroadcast();
}

function showCompletionFeedback(reminder) {
  if (!reminderWindow) {
    return;
  }

  reminderWindow.webContents.send('reminder:completed', {
    reminder,
    stats: state.stats
  });
  setTimeout(() => {
    if (reminderWindow && reminderWindow.isVisible()) {
      hideReminderWindow();
    }
  }, 1500);
}

function resetTodayStats() {
  const now = Date.now();
  state.stats = createInitialState().stats;
  state.reminders = state.reminders.map((reminder) => ({
    ...reminder,
    disabledToday: false,
    nextDueInSeconds: getReminderSettings(reminder.id).intervalMinutes * 60,
    nextDueAt: now + getReminderSettings(reminder.id).intervalMinutes * 60 * 1000
  }));
  lastShownReminderId = null;
  hideReminderWindow();
  saveAndBroadcast();
}

function snoozeReminder(reminderId, minutes) {
  state.stats.snoozedBreaks += 1;
  scheduleReminder(reminderId, minutes);
  hideReminderWindow();
  saveAndBroadcast();
}

function disableReminderToday(reminderId) {
  const reminder = state.reminders.find((item) => item.id === reminderId);
  if (reminder) {
    reminder.disabledToday = true;
    state.stats.skippedToday += 1;
  }
  if (lastShownReminderId === reminderId) {
    lastShownReminderId = null;
  }
  hideReminderWindow();
  saveAndBroadcast();
}

function hideReminderWindow() {
  if (reminderWindow) {
    reminderWindow.hide();
  }
}

function toggleTimer(forceAction) {
  state.settings.isRunning = forceAction ? forceAction === 'start' : !state.settings.isRunning;
  if (!state.settings.isRunning) {
    state.stats.currentSessionSeconds = 0;
    state.settings.focusPauseUntil = null;
  }
  updateTrayMenu();
  saveAndBroadcast();
}

function focusPause(minutes) {
  state.settings.isRunning = true;
  state.settings.focusPauseUntil = Date.now() + minutes * 60 * 1000;
  hideReminderWindow();
  updateTrayMenu();
  saveAndBroadcast();
}

function resumeNow() {
  state.settings.focusPauseUntil = null;
  updateTrayMenu();
  saveAndBroadcast();
}

function isFocusPaused() {
  return isFocusPausedInState(state);
}

function clearExpiredFocusPause() {
  if (clearExpiredFocusPauseInState(state)) {
    updateTrayMenu();
  }
}

function dismissOnboarding() {
  state.settings.onboardingDismissed = true;
  saveAndBroadcast();
}

function updateSettings(nextSettings) {
  const previous = state.settings;
  state.settings = {
    ...previous,
    ...nextSettings,
    reminders: {
      ...previous.reminders,
      ...(nextSettings.reminders || {})
    }
  };

  for (const reminder of state.reminders) {
    const current = getReminderSettings(reminder.id);
    const previousInterval = previous.reminders[reminder.id]?.intervalMinutes;
    if (current.intervalMinutes !== previousInterval) {
      scheduleReminder(reminder.id, current.intervalMinutes);
    }
  }

  applyLaunchAtStartup();
  saveAndBroadcast();
}

function applyLaunchAtStartup() {
  const canApplyLoginItem = isWindows || (isMac && app.isPackaged);
  if (!app.isReady() || !canApplyLoginItem) {
    return;
  }
  app.setLoginItemSettings({
    openAtLogin: Boolean(state.settings.launchAtStartup),
    openAsHidden: true
  });
}

function saveAndBroadcast() {
  saveState();
  broadcastState();
}

function quitApp() {
  app.isQuitting = true;
  app.quit();
}

function broadcastState() {
  const snapshot = getPublicState();
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('state:changed', snapshot);
  }
}

function getNextReminderSnapshot() {
  return getNextReminderSnapshotFromState(state);
}

function getPublicState() {
  const now = Date.now();
  const nextReminder = getNextReminderSnapshot();
  const publicNextReminder = nextReminder
    ? {
      ...nextReminder,
      nextDueAt: now + Math.max(0, nextReminder.nextDueInSeconds || 0) * 1000
    }
    : undefined;

  return {
    ...state,
    reminders: state.reminders.map((reminder) => ({
      ...reminder,
      nextDueAt: now + Math.max(0, reminder.nextDueInSeconds || 0) * 1000
    })),
    nextReminder: publicNextReminder,
    appMeta: {
      platform: process.platform,
      isPackaged: app.isPackaged,
      canApplyLoginItem: isWindows || (isMac && app.isPackaged),
      isSystemAvailable,
      isFocusPaused: isFocusPaused()
    }
  };
}

ipcMain.handle('state:get', () => getPublicState());
ipcMain.handle('settings:update', (_event, settings) => {
  updateSettings(settings);
  return getPublicState();
});
ipcMain.handle('onboarding:dismiss', () => {
  dismissOnboarding();
  return getPublicState();
});
ipcMain.handle('timer:control', (_event, action) => {
  toggleTimer(action);
  return getPublicState();
});
ipcMain.handle('timer:focusPause', (_event, minutes) => {
  focusPause(minutes);
  return getPublicState();
});
ipcMain.handle('timer:resumeNow', () => {
  resumeNow();
  return getPublicState();
});
ipcMain.handle('reminder:test', () => {
  showTestReminder();
  return getPublicState();
});
ipcMain.handle('reminder:complete', (_event, reminderId) => {
  completeReminder(reminderId);
  return getPublicState();
});
ipcMain.handle('reminder:snooze', (_event, reminderId, minutes) => {
  snoozeReminder(reminderId, minutes);
  return getPublicState();
});
ipcMain.handle('reminder:disableToday', (_event, reminderId) => {
  disableReminderToday(reminderId);
  return getPublicState();
});
ipcMain.handle('reminder:hide', () => {
  hideReminderWindow();
  return getPublicState();
});

app.whenReady().then(() => {
  loadState();
  createWindows();
  Menu.setApplicationMenu(null);
  createTray();
  registerPowerEvents();
  if (isMac) {
    app.dock.hide();
  }
  startTicker();
});

app.on('activate', showMainWindow);

app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  app.isQuitting = true;
  saveState();
  clearInterval(tickTimer);
});
