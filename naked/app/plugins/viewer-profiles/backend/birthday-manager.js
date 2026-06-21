/**
 * Birthday Manager
 * 
 * Handles birthday tracking, notifications, and celebrations
 */

class BirthdayManager {
  constructor(db, api) {
    this.db = db;
    this.api = api;
    this.checkInterval = null;
    this.notifiedToday = new Set(); // Track birthdays already notified today
  }

  /**
   * Start birthday checking
   */
  start() {
    this.api.log('Starting birthday checker...', 'info');
    
    // Check immediately on start
    this.checkBirthdays();

    // Schedule daily check at midnight
    this.scheduleDailyCheck();
  }

  /**
   * Stop birthday checking
   */
  stop() {
    if (this.checkInterval) {
      clearTimeout(this.checkInterval);
      this.checkInterval = null;
    }
    this.api.log('Birthday checker stopped', 'info');
  }

  /**
   * Schedule daily birthday check
   */
  scheduleDailyCheck() {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    const msUntilMidnight = tomorrow - now;

    this.checkInterval = setTimeout(() => {
      this.checkBirthdays();
      // Schedule next check (24 hours)
      this.scheduleDailyCheck();
    }, msUntilMidnight);

    this.api.log(`Next birthday check scheduled for ${tomorrow.toISOString()}`, 'debug');
  }

  /**
   * Check for birthdays today
   */
  checkBirthdays() {
    try {
      const today = new Date().toISOString().slice(5, 10); // MM-DD

      const birthdayViewers = this.api.getDatabase().prepare(`
        SELECT * FROM viewer_profiles
        WHERE substr(birthday, 6, 5) = ?
          AND birthday IS NOT NULL
          AND birthday != ''
      `).all(today);

      if (birthdayViewers.length > 0) {
        this.api.log(`🎂 Found ${birthdayViewers.length} birthday(s) today!`, 'info');

        birthdayViewers.forEach(viewer => {
          // Emit notification event
          this.api.emit('viewer:birthday', {
            username: viewer.tiktok_username,
            displayName: viewer.display_name,
            viewerId: viewer.id,
            age: this.calculateAge(viewer.birthday)
          });

          this.api.log(`🎂 Birthday today: ${viewer.display_name} (${viewer.tiktok_username})`, 'info');
        });
      }

      // Clear notified cache at midnight
      this.notifiedToday.clear();

    } catch (error) {
      this.api.log(`Error checking birthdays: ${error.message}`, 'error');
    }
  }

  /**
   * Check if viewer joining has birthday today
   */
  onViewerJoin(username) {
    try {
      // Skip if already notified today
      if (this.notifiedToday.has(username)) {
        return;
      }

      const viewer = this.db.getViewerByUsername(username);
      if (!viewer || !viewer.birthday) {
        return;
      }

      const today = new Date().toISOString().slice(5, 10);
      const birthday = viewer.birthday.slice(5, 10);

      if (today === birthday) {
        // Emit live birthday notification
        this.api.emit('viewer:birthday-live', {
          username: viewer.tiktok_username,
          displayName: viewer.display_name,
          viewerId: viewer.id,
          age: this.calculateAge(viewer.birthday)
        });

        this.api.log(`🎂 Birthday viewer joined: ${viewer.display_name}`, 'info');

        // Mark as notified
        this.notifiedToday.add(username);

        // Send birthday greeting
        this.sendBirthdayGreeting(viewer);
      }

    } catch (error) {
      this.api.log(`Error checking viewer birthday: ${error.message}`, 'error');
    }
  }

  /**
   * Send birthday greeting via TTS and/or Chat
   */
  sendBirthdayGreeting(viewer) {
    try {
      const config = this.api.getConfig('birthday-config') || {};
      const greetingTemplate = config.greetingTemplate || '🎂 Happy Birthday {displayName}! 🎉';
      const message = greetingTemplate
        .replace('{displayName}', viewer.display_name || viewer.tiktok_username)
        .replace('{username}', viewer.tiktok_username)
        .replace('{age}', this.calculateAge(viewer.birthday) || '?');

      // Emit event for other plugins (TTS, Chat, etc.)
      this.api.emit('viewer-profiles:birthday-greeting', {
        viewer,
        message,
        age: this.calculateAge(viewer.birthday)
      });

      this.api.log(`🎂 Birthday greeting sent for ${viewer.tiktok_username}: ${message}`, 'info');
    } catch (error) {
      this.api.log(`Error sending birthday greeting: ${error.message}`, 'error');
    }
  }

  /**
   * Calculate age from birthday
   */
  calculateAge(birthday) {
    if (!birthday) {
      return null;
    }

    try {
      const birthDate = new Date(birthday);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();

      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }

      return age;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get upcoming birthdays
   */
  getUpcomingBirthdays(days = 7) {
    return this.db.getUpcomingBirthdays(days);
  }

  /**
   * Set birthday for viewer
   */
  setBirthday(username, birthday) {
    try {
      // Validate birthday format (YYYY-MM-DD)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
        throw new Error('Invalid birthday format. Use YYYY-MM-DD');
      }

      const viewer = this.db.getViewerByUsername(username);
      if (!viewer) {
        throw new Error('Viewer not found');
      }

      this.db.updateViewer(username, { birthday });

      this.api.log(`Set birthday for ${username}: ${birthday}`, 'info');

      return this.db.getViewerByUsername(username);
    } catch (error) {
      this.api.log(`Error setting birthday: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Clear birthday for viewer
   */
  clearBirthday(username) {
    try {
      this.db.updateViewer(username, { birthday: null });
      this.api.log(`Cleared birthday for ${username}`, 'info');
    } catch (error) {
      this.api.log(`Error clearing birthday: ${error.message}`, 'error');
      throw error;
    }
  }
}

module.exports = BirthdayManager;
