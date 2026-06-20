# Privacy

Tonicue 瞳休 is designed as a local-first desktop reminder app.

## Data Collection

Tonicue does not collect, transmit, or sell personal data.

The app currently does not require:

- Account registration
- Internet access for normal use
- Remote analytics
- Cloud sync

## Local Data

Tonicue stores reminder settings, daily stats, and reminder state locally in Electron's app data directory.

Examples of stored data:

- Whether reminders are running
- Reminder intervals
- Today screen-time stats
- Completed and snoozed reminder counts
- First-run onboarding status

## Data Deletion

You can reset daily stats inside the app. To fully remove local app data, delete Tonicue's app data directory for your operating system.

Common locations:

- macOS: `~/Library/Application Support/Tonicue 瞳休/`
- Windows: `%APPDATA%/Tonicue 瞳休/`

## Network

Preview builds do not need network access for normal reminder functionality.

## Future Changes

If cloud sync, analytics, crash reporting, or update checks are added later, this document should be updated before release.
