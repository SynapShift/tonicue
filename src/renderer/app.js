const params = new URLSearchParams(window.location.search);
const view = params.get('view') || 'main';

const mainView = document.querySelector('#main-view');
const reminderView = document.querySelector('#reminder-view');
const elements = {
  timerToggle: document.querySelector('#timer-toggle'),
  testReminder: document.querySelector('#test-reminder'),
  focusPause: document.querySelector('#focus-pause'),
  onboardingCard: document.querySelector('#onboarding-card'),
  dismissOnboarding: document.querySelector('#dismiss-onboarding'),
  runningLabel: document.querySelector('#running-label'),
  nextReminderText: document.querySelector('#next-reminder-text'),
  currentSession: document.querySelector('#current-session'),
  sessionProgress: document.querySelector('#session-progress'),
  sessionCopy: document.querySelector('#session-copy'),
  totalScreen: document.querySelector('#total-screen'),
  longestSession: document.querySelector('#longest-session'),
  completedBreaks: document.querySelector('#completed-breaks'),
  snoozedBreaks: document.querySelector('#snoozed-breaks'),
  rhythmScore: document.querySelector('#rhythm-score'),
  protectionSummary: document.querySelector('#protection-summary'),
  soundToggle: document.querySelector('#sound-toggle'),
  startupToggle: document.querySelector('#startup-toggle'),
  startupLabel: document.querySelector('#startup-label'),
  reminderList: document.querySelector('#reminder-list'),
  popMascot: document.querySelector('#pop-mascot'),
  reminderTitle: document.querySelector('#reminder-title'),
  reminderMessage: document.querySelector('#reminder-message'),
  exerciseGuide: document.querySelector('#exercise-guide'),
  restTimer: document.querySelector('#rest-timer'),
  restCountdown: document.querySelector('#rest-countdown'),
  reminderSession: document.querySelector('#reminder-session'),
  completeReminder: document.querySelector('#complete-reminder'),
  snoozeOneReminder: document.querySelector('#snooze-one-reminder'),
  snoozeReminder: document.querySelector('#snooze-reminder'),
  skipReminder: document.querySelector('#skip-reminder'),
  closeReminder: document.querySelector('#close-reminder')
};

let currentState;
let activeReminder;
let restCountdownTimer;

if (view === 'reminder') {
  mainView.classList.add('hidden');
  reminderView.classList.remove('hidden');
} else {
  mainView.classList.remove('hidden');
  reminderView.classList.add('hidden');
}

function formatSeconds(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  const hours = String(Math.floor(safe / 3600)).padStart(2, '0');
  const minutes = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const rest = String(safe % 60).padStart(2, '0');
  return `${hours}:${minutes}:${rest}`;
}

function formatDistance(timestamp) {
  if (!timestamp) {
    return '暂时没有排队中的提醒';
  }
  const seconds = Math.max(0, Math.floor((timestamp - Date.now()) / 1000));
  const minutes = Math.ceil(seconds / 60);
  if (minutes <= 1) {
    return '不到 1 分钟后';
  }
  return `${minutes} 分钟后`;
}

function getReminderSettings(state, reminderId) {
  return state.settings.reminders[reminderId] || {};
}

function renderState(state) {
  currentState = state;
  if (view !== 'main') {
    return;
  }

  elements.currentSession.textContent = formatSeconds(state.stats.currentSessionSeconds);
  elements.totalScreen.textContent = formatSeconds(state.stats.totalScreenSeconds);
  elements.longestSession.textContent = formatSeconds(state.stats.longestSessionSeconds);
  elements.completedBreaks.textContent = `${state.stats.completedBreaks} 次`;
  elements.snoozedBreaks.textContent = `${state.stats.snoozedBreaks} 次`;
  elements.rhythmScore.textContent = getRhythmScore(state);
  elements.protectionSummary.textContent = `${state.stats.completedBreaks + state.stats.snoozedBreaks} 次`;
  elements.soundToggle.checked = state.settings.soundEnabled;
  elements.startupToggle.checked = state.settings.launchAtStartup;
  const isMacDev = state.appMeta.platform === 'darwin' && !state.appMeta.canApplyLoginItem;
  elements.startupLabel.textContent = state.appMeta.platform === 'darwin' ? '登录时启动' : '开机自启';
  elements.startupToggle.disabled = isMacDev;
  elements.startupToggle.closest('label').title = isMacDev ? '打包成 macOS App 后可用' : '';
  elements.timerToggle.textContent = state.settings.isRunning ? '暂停提醒' : '继续提醒';
  elements.focusPause.textContent = state.appMeta.isFocusPaused ? '立即恢复' : '专注 30 分钟';
  elements.runningLabel.textContent = state.appMeta.isFocusPaused
    ? '专注暂停中'
    : state.settings.isRunning ? '后台运行中' : '已暂停';
  elements.onboardingCard.classList.toggle('hidden', state.settings.onboardingDismissed);

  const next = state.nextReminder;
  if (next) {
    elements.nextReminderText.textContent = `${formatDistance(next.nextDueAt)}提醒你：${next.shortTitle}`;
    const settings = getReminderSettings(state, next.id);
    const intervalSeconds = Math.max(60, (settings.intervalMinutes || next.intervalMinutes) * 60);
    const progress = Math.min(100, (state.stats.currentSessionSeconds / intervalSeconds) * 100);
    elements.sessionProgress.style.width = `${progress}%`;
  } else {
    elements.nextReminderText.textContent = '今天的小提醒都安静排好队了。';
    elements.sessionProgress.style.width = '0%';
  }

  if (state.appMeta.isFocusPaused) {
    elements.sessionCopy.textContent = '专注暂停中，瞳休暂时不会打扰你。';
  } else if (!state.settings.isRunning) {
    elements.sessionCopy.textContent = '暂停中，休息也是正经事。';
  } else if (state.stats.currentSessionSeconds > 50 * 60) {
    elements.sessionCopy.textContent = '已经盯屏很久啦，下一次提醒会认真出现。';
  } else {
    elements.sessionCopy.textContent = '眼睛正在认真上班，瞳休会在旁边看着时间。';
  }

  renderReminderList(state);
}

function renderReminderList(state) {
  elements.reminderList.innerHTML = '';

  for (const reminder of state.reminders) {
    const settings = getReminderSettings(state, reminder.id);
    const item = document.createElement('article');
    item.className = 'reminder-item';
    item.innerHTML = `
      <div class="reminder-copy">
        <strong>${reminder.shortTitle}</strong>
        <span>${reminder.disabledToday ? '今日已安静' : formatDistance(reminder.nextDueAt)}</span>
      </div>
      <label class="switch-row" title="开启或关闭">
        <input type="checkbox" data-kind="enabled" data-id="${reminder.id}" ${settings.enabled ? 'checked' : ''} />
        <span></span>
      </label>
      <label class="interval-control">
        间隔/分钟
        <select data-kind="interval" data-id="${reminder.id}">
          ${[15, 20, 30, 45, 60, 90, 120].map((minutes) => `
            <option value="${minutes}" ${Number(settings.intervalMinutes) === minutes ? 'selected' : ''}>${minutes}</option>
          `).join('')}
        </select>
      </label>
    `;
    elements.reminderList.appendChild(item);
  }
}

async function updateReminderSetting(reminderId, patch) {
  const existing = getReminderSettings(currentState, reminderId);
  await window.tonicue.updateSettings({
    reminders: {
      [reminderId]: {
        ...existing,
        ...patch
      }
    }
  });
}

function playSoftChime() {
  const audioContext = new AudioContext();
  const notes = [523.25, 659.25, 783.99];
  notes.forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = 'sine';
    gain.gain.setValueAtTime(0.001, audioContext.currentTime + index * 0.08);
    gain.gain.exponentialRampToValueAtTime(0.08, audioContext.currentTime + index * 0.08 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + index * 0.08 + 0.28);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(audioContext.currentTime + index * 0.08);
    oscillator.stop(audioContext.currentTime + index * 0.08 + 0.3);
  });
}

function renderReminder(payload) {
  activeReminder = payload.reminder;
  stopRestCountdown();
  elements.completeReminder.disabled = false;
  elements.snoozeOneReminder.disabled = false;
  elements.snoozeReminder.disabled = false;
  elements.skipReminder.disabled = false;
  elements.popMascot.textContent = activeReminder.emoji;
  elements.popMascot.style.background = activeReminder.color;
  elements.reminderTitle.textContent = activeReminder.title;
  elements.reminderMessage.textContent = activeReminder.message;
  renderExerciseGuide(activeReminder.id);
  elements.reminderSession.textContent = formatSeconds(payload.stats.currentSessionSeconds);

  if (payload.soundEnabled) {
    playSoftChime();
  }
}

function renderCompletion(payload) {
  activeReminder = null;
  elements.popMascot.textContent = 'OK';
  elements.popMascot.style.background = '#75c8b3';
  elements.reminderTitle.textContent = '完成啦';
  elements.reminderMessage.textContent = '这一次休息已经记下来了，下一轮提醒会重新排队。';
  elements.exerciseGuide.innerHTML = '';
  elements.restTimer.classList.add('hidden');
  elements.reminderSession.textContent = formatSeconds(payload.stats.currentSessionSeconds);
  elements.completeReminder.disabled = true;
  elements.snoozeOneReminder.disabled = true;
  elements.snoozeReminder.disabled = true;
  elements.skipReminder.disabled = true;
}

function renderExerciseGuide(reminderId) {
  const guides = {
    eye: {
      steps: ['看向窗外或 6 米外', '慢慢眨眼，放松眉心', '让屏幕离开视线 20 秒'],
      countdown: 20
    },
    water: {
      steps: ['喝几口水', '顺手放松下颌', '把肩膀从耳边放下来']
    },
    neck: {
      steps: ['下巴轻轻回收', '左右各转动 2 次', '肩膀向后绕一圈']
    },
    stand: {
      steps: ['站起来离开座位', '走几步', '顺手伸展腰背']
    }
  };
  const guide = guides[reminderId] || guides.eye;
  elements.exerciseGuide.innerHTML = guide.steps.map((step) => `<span>${step}</span>`).join('');

  if (guide.countdown) {
    startRestCountdown(guide.countdown);
  } else {
    elements.restTimer.classList.add('hidden');
  }
}

function startRestCountdown(seconds) {
  let remaining = seconds;
  elements.restCountdown.textContent = String(remaining);
  elements.restTimer.classList.remove('hidden');
  restCountdownTimer = setInterval(() => {
    remaining -= 1;
    elements.restCountdown.textContent = String(Math.max(0, remaining));
    if (remaining <= 0) {
      if (restCountdownTimer) {
        clearInterval(restCountdownTimer);
        restCountdownTimer = undefined;
      }
      elements.restCountdown.textContent = 'OK';
    }
  }, 1000);
}

function stopRestCountdown() {
  if (restCountdownTimer) {
    clearInterval(restCountdownTimer);
    restCountdownTimer = undefined;
  }
}

function getRhythmScore(state) {
  const longestMinutes = Math.floor(state.stats.longestSessionSeconds / 60);
  if (state.stats.totalScreenSeconds < 60) {
    return '刚开始';
  }
  if (longestMinutes < 35 && state.stats.completedBreaks > 0) {
    return '很稳';
  }
  if (longestMinutes < 50) {
    return '不错';
  }
  if (longestMinutes < 75) {
    return '偏久';
  }
  return '该歇歇';
}

if (view === 'main') {
  elements.timerToggle.addEventListener('click', async () => {
    await window.tonicue.controlTimer(currentState.settings.isRunning ? 'pause' : 'start');
  });

  elements.testReminder.addEventListener('click', async () => {
    await window.tonicue.testReminder();
  });

  elements.focusPause.addEventListener('click', async () => {
    if (currentState.appMeta.isFocusPaused) {
      await window.tonicue.resumeNow();
    } else {
      await window.tonicue.focusPause(30);
    }
  });

  elements.dismissOnboarding.addEventListener('click', async () => {
    await window.tonicue.dismissOnboarding();
  });

  elements.soundToggle.addEventListener('change', async (event) => {
    await window.tonicue.updateSettings({ soundEnabled: event.target.checked });
  });

  elements.startupToggle.addEventListener('change', async (event) => {
    await window.tonicue.updateSettings({ launchAtStartup: event.target.checked });
  });

  elements.reminderList.addEventListener('change', async (event) => {
    const target = event.target;
    const reminderId = target.dataset.id;
    if (!reminderId) {
      return;
    }

    if (target.dataset.kind === 'enabled') {
      await updateReminderSetting(reminderId, { enabled: target.checked });
    }

    if (target.dataset.kind === 'interval') {
      const value = Math.max(5, Math.min(240, Number(target.value) || 30));
      await updateReminderSetting(reminderId, { intervalMinutes: value });
    }
  });
}

if (view === 'reminder') {
  elements.completeReminder.addEventListener('click', async () => {
    if (activeReminder) {
      await window.tonicue.completeReminder(activeReminder.id);
    }
  });

  elements.snoozeReminder.addEventListener('click', async () => {
    if (activeReminder) {
      await window.tonicue.snoozeReminder(activeReminder.id, 5);
    }
  });

  elements.snoozeOneReminder.addEventListener('click', async () => {
    if (activeReminder) {
      await window.tonicue.snoozeReminder(activeReminder.id, 1);
    }
  });

  elements.skipReminder.addEventListener('click', async () => {
    if (activeReminder) {
      await window.tonicue.disableReminderToday(activeReminder.id);
    }
  });

  elements.closeReminder.addEventListener('click', async () => {
    if (activeReminder) {
      await window.tonicue.snoozeReminder(activeReminder.id, 5);
    } else {
      await window.tonicue.hideReminder();
    }
  });

  window.tonicue.onReminder(renderReminder);
  window.tonicue.onReminderCompleted(renderCompletion);
}

window.tonicue.onState(renderState);
window.tonicue.getState().then(renderState);
