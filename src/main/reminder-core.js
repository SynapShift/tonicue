const REMINDERS = [
  {
    id: 'eye',
    title: '眼睛想去窗边放个小假',
    shortTitle: '远眺休息',
    message: '你已经连续看屏幕一会儿啦。看向 6 米外，慢慢眨眼 20 秒。',
    intervalMinutes: 30,
    color: '#75c8b3',
    emoji: 'o_o'
  },
  {
    id: 'water',
    title: '小水杯正在举手',
    shortTitle: '喝水',
    message: '喝两口水，顺便把肩膀放下来。',
    intervalMinutes: 60,
    color: '#7ab8ff',
    emoji: 'cup'
  },
  {
    id: 'neck',
    title: '脖子发来一条温柔提醒',
    shortTitle: '活动脖子',
    message: '左右慢慢转动脖子，再做一次肩颈放松。',
    intervalMinutes: 45,
    color: '#ffb36b',
    emoji: 'neck'
  },
  {
    id: 'stand',
    title: '身体想站起来醒一醒',
    shortTitle: '起身走走',
    message: '离开座位 1 分钟，走几步，让腿和腰也参与今天。',
    intervalMinutes: 90,
    color: '#d896ff',
    emoji: 'walk'
  }
];

const DEFAULT_SETTINGS = {
  isRunning: true,
  soundEnabled: true,
  launchAtStartup: false,
  onboardingDismissed: false,
  focusPauseUntil: null,
  reminders: Object.fromEntries(
    REMINDERS.map((reminder) => [
      reminder.id,
      {
        enabled: true,
        intervalMinutes: reminder.intervalMinutes
      }
    ])
  )
};

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function createInitialState(now = Date.now()) {
  return {
    dateKey: getDateKey(new Date(now)),
    settings: structuredClone(DEFAULT_SETTINGS),
    stats: {
      totalScreenSeconds: 0,
      currentSessionSeconds: 0,
      longestSessionSeconds: 0,
      completedBreaks: 0,
      snoozedBreaks: 0,
      skippedToday: 0
    },
    reminders: REMINDERS.map((reminder) => ({
      ...reminder,
      nextDueInSeconds: reminder.intervalMinutes * 60,
      nextDueAt: now + reminder.intervalMinutes * 60 * 1000,
      disabledToday: false
    }))
  };
}

function mergeState(saved = {}, now = Date.now()) {
  const base = createInitialState(now);
  return {
    ...base,
    ...saved,
    settings: {
      ...base.settings,
      ...(saved.settings || {}),
      reminders: {
        ...base.settings.reminders,
        ...(saved.settings && saved.settings.reminders)
      }
    },
    stats: {
      ...base.stats,
      ...(saved.stats || {})
    },
    reminders: base.reminders.map((reminder) => {
      const savedReminder = (saved.reminders || []).find((item) => item.id === reminder.id) || {};
      const settings = (saved.settings && saved.settings.reminders && saved.settings.reminders[reminder.id]) ||
        base.settings.reminders[reminder.id];
      const intervalSeconds = settings.intervalMinutes * 60;
      const migratedDueInSeconds =
        typeof savedReminder.nextDueInSeconds === 'number'
          ? savedReminder.nextDueInSeconds
          : Math.ceil(((savedReminder.nextDueAt || now + intervalSeconds * 1000) - now) / 1000);

      const nextDueInSeconds = clampDueSeconds(migratedDueInSeconds, intervalSeconds);
      return {
        ...reminder,
        ...savedReminder,
        nextDueInSeconds,
        nextDueAt: now + nextDueInSeconds * 1000
      };
    })
  };
}

function clampDueSeconds(seconds, fallbackSeconds) {
  const safeFallback = Math.max(60, fallbackSeconds || 30 * 60);
  if (!Number.isFinite(seconds)) {
    return safeFallback;
  }
  return Math.max(1, Math.min(safeFallback, Math.ceil(seconds)));
}

function getReminderSettings(state, reminderId) {
  return state.settings.reminders[reminderId] || DEFAULT_SETTINGS.reminders[reminderId];
}

function resetDailyStatsIfNeeded(state, now = Date.now()) {
  const today = getDateKey(new Date(now));
  if (state.dateKey === today) {
    return false;
  }

  const freshStats = createInitialState(now).stats;
  state.dateKey = today;
  state.stats = freshStats;
  state.reminders = state.reminders.map((reminder) => {
    const intervalSeconds = getReminderSettings(state, reminder.id).intervalMinutes * 60;
    return {
      ...reminder,
      disabledToday: false,
      nextDueInSeconds: intervalSeconds,
      nextDueAt: now + intervalSeconds * 1000
    };
  });
  return true;
}

function tickReminderCountdowns(state, deltaSeconds, now = Date.now()) {
  for (const reminder of state.reminders) {
    const settings = getReminderSettings(state, reminder.id);
    if (!settings.enabled || reminder.disabledToday) {
      continue;
    }
    reminder.nextDueInSeconds = Math.max(0, reminder.nextDueInSeconds - deltaSeconds);
    reminder.nextDueAt = now + reminder.nextDueInSeconds * 1000;
  }
}

function scheduleReminder(state, reminderId, minutes, now = Date.now()) {
  const reminder = state.reminders.find((item) => item.id === reminderId);
  if (!reminder) {
    return false;
  }
  reminder.nextDueInSeconds = minutes * 60;
  reminder.nextDueAt = now + reminder.nextDueInSeconds * 1000;
  return true;
}

function getNextReminderSnapshot(state) {
  return state.reminders
    .filter((reminder) => {
      const settings = getReminderSettings(state, reminder.id);
      return settings.enabled && !reminder.disabledToday;
    })
    .sort((a, b) => a.nextDueInSeconds - b.nextDueInSeconds)[0];
}

function formatRemaining(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds || 0));
  const minutes = Math.ceil(safeSeconds / 60);
  if (minutes <= 1) {
    return '不到 1 分钟';
  }
  return `${minutes} 分钟`;
}

function isFocusPaused(state, now = Date.now()) {
  return Boolean(state.settings.focusPauseUntil && now < state.settings.focusPauseUntil);
}

function clearExpiredFocusPause(state, now = Date.now()) {
  if (state.settings.focusPauseUntil && now >= state.settings.focusPauseUntil) {
    state.settings.focusPauseUntil = null;
    return true;
  }
  return false;
}

module.exports = {
  REMINDERS,
  DEFAULT_SETTINGS,
  clampDueSeconds,
  clearExpiredFocusPause,
  createInitialState,
  formatRemaining,
  getDateKey,
  getNextReminderSnapshot,
  getReminderSettings,
  isFocusPaused,
  mergeState,
  resetDailyStatsIfNeeded,
  scheduleReminder,
  tickReminderCountdowns
};
