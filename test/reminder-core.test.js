const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clearExpiredFocusPause,
  createInitialState,
  formatRemaining,
  getNextReminderSnapshot,
  getReminderSettings,
  isFocusPaused,
  mergeState,
  resetDailyStatsIfNeeded,
  scheduleReminder,
  tickReminderCountdowns
} = require('../src/main/reminder-core');

const NOW = new Date(2026, 5, 19, 9, 0, 0).getTime();
const TOMORROW = new Date(2026, 5, 20, 9, 0, 0).getTime();

test('createInitialState builds default reminders and daily stats', () => {
  const state = createInitialState(NOW);

  assert.equal(state.dateKey, '2026-06-19');
  assert.equal(state.stats.totalScreenSeconds, 0);
  assert.equal(state.reminders.length, 4);
  assert.deepEqual(
    state.reminders.map((reminder) => [reminder.id, reminder.nextDueInSeconds]),
    [
      ['eye', 30 * 60],
      ['water', 60 * 60],
      ['neck', 45 * 60],
      ['stand', 90 * 60]
    ]
  );
});

test('mergeState preserves saved choices and migrates absolute due time', () => {
  const saved = {
    settings: {
      reminders: {
        eye: {
          enabled: false,
          intervalMinutes: 25
        }
      }
    },
    stats: {
      totalScreenSeconds: 123
    },
    reminders: [
      {
        id: 'eye',
        disabledToday: true,
        nextDueAt: NOW + 10 * 60 * 1000
      }
    ]
  };

  const state = mergeState(saved, NOW);
  const eye = state.reminders.find((reminder) => reminder.id === 'eye');

  assert.equal(state.stats.totalScreenSeconds, 123);
  assert.equal(getReminderSettings(state, 'eye').enabled, false);
  assert.equal(getReminderSettings(state, 'eye').intervalMinutes, 25);
  assert.equal(eye.disabledToday, true);
  assert.equal(eye.nextDueInSeconds, 10 * 60);
});

test('tickReminderCountdowns only decrements active enabled reminders', () => {
  const state = createInitialState(NOW);
  state.settings.reminders.water.enabled = false;
  state.reminders.find((reminder) => reminder.id === 'neck').disabledToday = true;

  tickReminderCountdowns(state, 30, NOW + 30 * 1000);

  assert.equal(state.reminders.find((reminder) => reminder.id === 'eye').nextDueInSeconds, 30 * 60 - 30);
  assert.equal(state.reminders.find((reminder) => reminder.id === 'water').nextDueInSeconds, 60 * 60);
  assert.equal(state.reminders.find((reminder) => reminder.id === 'neck').nextDueInSeconds, 45 * 60);
});

test('scheduleReminder resets one reminder and reports missing ids', () => {
  const state = createInitialState(NOW);

  assert.equal(scheduleReminder(state, 'eye', 5, NOW), true);
  assert.equal(state.reminders.find((reminder) => reminder.id === 'eye').nextDueInSeconds, 5 * 60);
  assert.equal(scheduleReminder(state, 'missing', 5, NOW), false);
});

test('resetDailyStatsIfNeeded resets stats and reminders on a new day', () => {
  const state = createInitialState(NOW);
  state.stats.totalScreenSeconds = 999;
  state.stats.completedBreaks = 2;
  state.reminders[0].disabledToday = true;
  state.reminders[0].nextDueInSeconds = 1;

  assert.equal(resetDailyStatsIfNeeded(state, NOW), false);
  assert.equal(resetDailyStatsIfNeeded(state, TOMORROW), true);

  assert.equal(state.dateKey, '2026-06-20');
  assert.equal(state.stats.totalScreenSeconds, 0);
  assert.equal(state.stats.completedBreaks, 0);
  assert.equal(state.reminders[0].disabledToday, false);
  assert.equal(state.reminders[0].nextDueInSeconds, 30 * 60);
});

test('focus pause helpers report and clear expired pause windows', () => {
  const state = createInitialState(NOW);
  state.settings.focusPauseUntil = NOW + 60 * 1000;

  assert.equal(isFocusPaused(state, NOW), true);
  assert.equal(clearExpiredFocusPause(state, NOW + 30 * 1000), false);
  assert.equal(clearExpiredFocusPause(state, NOW + 60 * 1000), true);
  assert.equal(state.settings.focusPauseUntil, null);
  assert.equal(isFocusPaused(state, NOW + 60 * 1000), false);
});

test('getNextReminderSnapshot ignores disabled reminders', () => {
  const state = createInitialState(NOW);
  state.reminders.find((reminder) => reminder.id === 'eye').disabledToday = true;
  state.reminders.find((reminder) => reminder.id === 'neck').nextDueInSeconds = 20;

  assert.equal(getNextReminderSnapshot(state).id, 'neck');
});

test('formatRemaining returns compact Chinese labels', () => {
  assert.equal(formatRemaining(0), '不到 1 分钟');
  assert.equal(formatRemaining(61), '2 分钟');
});
