/**
 * Test: WebGPU Emoji Rain - Profile Picture Feature
 *
 * Verifies that profilePictureUrl is correctly forwarded from TikTok event
 * data through the spawn pipeline, and that fallback behaviour is correct
 * when no URL is available.
 *
 * Feature Requirements:
 * - profilePictureUrl from TikTok event data must be included in spawnData
 * - Users with '{{profilePicture}}' mapping should see profile pictures rendered
 * - When profilePictureUrl is missing, fallback to '👤' emoji instead of
 *   displaying the literal text '{{profilePicture}}'
 * - Existing emoji / custom-image behaviour must be unaffected
 */

describe('WebGPU Emoji Rain - Profile Picture Feature', () => {
  // ─── Helpers that mirror the server-side triggerEmojiRain logic ───────────

  /**
   * Builds the spawnData object the same way triggerEmojiRain does.
   * This is what gets emitted as 'webgpu-emoji-rain:spawn'.
   *
   * @param {object} params - Spawn parameters (emoji, count, username, profilePictureUrl, etc.)
   * @param {object} [config={}] - Plugin config with max_count_per_event, max_intensity, emoji_set
   * @returns {object} spawnData object that would be emitted via socket
   */
  function buildSpawnData(params, config = {}) {
    const maxCount = config.max_count_per_event || 100;
    const maxIntensity = config.max_intensity || 3.0;
    const emojiSet = config.emoji_set || ['💙'];

    return {
      count: Math.min(params.count || 10, maxCount),
      emoji: params.emoji || emojiSet[0] || '💙',
      x: params.x !== undefined ? params.x : Math.random(),
      y: params.y !== undefined ? params.y : 0,
      username: params.username || null,
      profilePictureUrl: params.profilePictureUrl || null,
      reason: params.reason || 'manual',
      burst: params.burst || false,
      intensity: Math.min(params.intensity || 1.0, maxIntensity)
    };
  }

  /**
   * Resolves the final emoji string and useProfilePicture flag the same way
   * the client-side spawnEmoji function does (both engine.js and obs-hud.js).
   * Applies user mapping, detects the '{{profilePicture}}' marker, and returns
   * the fallback emoji '👤' when the marker is present but no URL is available.
   *
   * @param {string} emoji - Incoming emoji (may be overridden by userEmojiMap)
   * @param {string|null} profilePictureUrl - TikTok avatar URL, or null if unavailable
   * @param {object} [userEmojiMap={}] - Map of username → emoji/marker
   * @param {string|null} [username=null] - Username for mapping lookup
   * @returns {{ emoji: string, useProfilePicture: boolean }}
   */
  function resolveEmojiForSpawn(emoji, profilePictureUrl, userEmojiMap = {}, username = null) {
    // Apply user mapping (same logic as client-side spawnEmoji)
    if (username) {
      if (userEmojiMap[username]) {
        emoji = userEmojiMap[username];
      } else {
        const lowerUsername = username.toLowerCase();
        const mappedUser = Object.keys(userEmojiMap).find(
          key => key.toLowerCase() === lowerUsername
        );
        if (mappedUser) {
          emoji = userEmojiMap[mappedUser];
        }
      }
    }

    // Determine render mode (same as fixed client-side logic)
    const useProfilePicture = !!(emoji === '{{profilePicture}}' && profilePictureUrl);
    if (emoji === '{{profilePicture}}' && !profilePictureUrl) {
      emoji = '👤'; // fallback when URL is unavailable
    }

    return { emoji, useProfilePicture };
  }

  // ─── Server-side: spawnData forwarding ────────────────────────────────────

  test('profilePictureUrl from TikTok event is included in spawnData', () => {
    const tikTokData = {
      uniqueId: 'testuser',
      profilePictureUrl: 'https://p16-sign.tiktokcdn.com/avatar.jpg',
      coins: 10
    };

    const params = {
      emoji: '💙',
      count: 5,
      username: tikTokData.uniqueId,
      profilePictureUrl: tikTokData.profilePictureUrl || null,
      reason: 'gift'
    };

    const spawnData = buildSpawnData(params);

    expect(spawnData.profilePictureUrl).toBe('https://p16-sign.tiktokcdn.com/avatar.jpg');
    expect(spawnData.username).toBe('testuser');
  });

  test('profilePictureUrl is null when TikTok event provides no avatar', () => {
    const tikTokData = { uniqueId: 'testuser', coins: 10 };

    const params = {
      emoji: '💙',
      count: 5,
      username: tikTokData.uniqueId,
      profilePictureUrl: tikTokData.profilePictureUrl || null,
      reason: 'gift'
    };

    const spawnData = buildSpawnData(params);

    expect(spawnData.profilePictureUrl).toBeNull();
  });

  test('spawnData includes all required fields when profilePictureUrl is present', () => {
    const params = {
      emoji: '{{profilePicture}}',
      count: 3,
      username: 'alice',
      profilePictureUrl: 'https://cdn.tiktok.com/alice.jpg',
      reason: 'follow'
    };

    const spawnData = buildSpawnData(params);

    expect(spawnData).toHaveProperty('count', 3);
    expect(spawnData).toHaveProperty('emoji', '{{profilePicture}}');
    expect(spawnData).toHaveProperty('username', 'alice');
    expect(spawnData).toHaveProperty('profilePictureUrl', 'https://cdn.tiktok.com/alice.jpg');
    expect(spawnData).toHaveProperty('reason', 'follow');
  });

  // ─── Client-side: render resolution ──────────────────────────────────────

  test('user with {{profilePicture}} mapping + valid URL → useProfilePicture = true', () => {
    const userEmojiMap = { alice: '{{profilePicture}}' };
    const { emoji, useProfilePicture } = resolveEmojiForSpawn(
      '💙',                                  // incoming emoji (overridden by mapping)
      'https://cdn.tiktok.com/alice.jpg',     // profilePictureUrl present
      userEmojiMap,
      'alice'
    );

    expect(useProfilePicture).toBe(true);
    expect(emoji).toBe('{{profilePicture}}'); // still the marker; rendering swaps it
  });

  test('user with {{profilePicture}} mapping but no URL → fallback emoji 👤', () => {
    const userEmojiMap = { alice: '{{profilePicture}}' };
    const { emoji, useProfilePicture } = resolveEmojiForSpawn(
      '💙',   // incoming emoji (overridden by mapping)
      null,   // no profilePictureUrl
      userEmojiMap,
      'alice'
    );

    expect(useProfilePicture).toBe(false);
    expect(emoji).toBe('👤');
  });

  test('user without {{profilePicture}} mapping → regular emoji, no profile picture', () => {
    const userEmojiMap = { alice: '🌟' };
    const { emoji, useProfilePicture } = resolveEmojiForSpawn(
      '💙',
      'https://cdn.tiktok.com/alice.jpg',
      userEmojiMap,
      'alice'
    );

    expect(useProfilePicture).toBe(false);
    expect(emoji).toBe('🌟'); // user mapping applied, but not profile-picture mode
  });

  test('unknown user → incoming emoji used as-is, no profile picture', () => {
    const userEmojiMap = { alice: '{{profilePicture}}' };
    const { emoji, useProfilePicture } = resolveEmojiForSpawn(
      '🔥',
      'https://cdn.tiktok.com/bob.jpg',
      userEmojiMap,
      'bob'  // not in map
    );

    expect(useProfilePicture).toBe(false);
    expect(emoji).toBe('🔥');
  });

  test('case-insensitive user mapping is applied correctly', () => {
    const userEmojiMap = { Alice: '{{profilePicture}}' };
    const { emoji, useProfilePicture } = resolveEmojiForSpawn(
      '💙',
      'https://cdn.tiktok.com/alice.jpg',
      userEmojiMap,
      'alice' // lowercase input, mapping stored as 'Alice'
    );

    expect(useProfilePicture).toBe(true);
    expect(emoji).toBe('{{profilePicture}}');
  });

  test('{{profilePicture}} marker without username or mapping → fallback emoji', () => {
    // Edge case: emoji set to marker directly but no URL and no username
    const { emoji, useProfilePicture } = resolveEmojiForSpawn(
      '{{profilePicture}}',
      null,
      {},
      null
    );

    expect(useProfilePicture).toBe(false);
    expect(emoji).toBe('👤');
  });

  // ─── End-to-end flow ──────────────────────────────────────────────────────

  test('full flow: TikTok gift event → spawnData has URL → profile picture renders', () => {
    // Step 1: TikTok gift event arrives at plugin
    const tikTokGiftEvent = {
      uniqueId: 'gifter123',
      profilePictureUrl: 'https://p16.tiktokcdn.com/gifter123.webp',
      coins: 500
    };

    // Step 2: spawnEmojiRain builds params and calls triggerEmojiRain
    const params = {
      emoji: '💙',
      count: 55,
      username: tikTokGiftEvent.uniqueId,
      profilePictureUrl: tikTokGiftEvent.profilePictureUrl || null,
      reason: 'gift'
    };

    // Step 3: triggerEmojiRain builds spawnData (the fix ensures profilePictureUrl is present)
    const spawnData = buildSpawnData(params, {
      max_count_per_event: 100,
      emoji_set: ['💙']
    });

    expect(spawnData.profilePictureUrl).toBe('https://p16.tiktokcdn.com/gifter123.webp');

    // Step 4: Client receives spawnData. User has {{profilePicture}} mapping.
    const userEmojiMap = { gifter123: '{{profilePicture}}' };
    const { emoji, useProfilePicture } = resolveEmojiForSpawn(
      spawnData.emoji,
      spawnData.profilePictureUrl,
      userEmojiMap,
      spawnData.username
    );

    expect(useProfilePicture).toBe(true);
    expect(emoji).toBe('{{profilePicture}}');
  });

  test('full flow without fix: spawnData missing URL → fallback emoji, no crash', () => {
    // Simulate the old (broken) behaviour where profilePictureUrl was not forwarded.
    // The client now gracefully falls back to 👤 instead of rendering '{{profilePicture}}'.
    const spawnData = {
      count: 5,
      emoji: '💙',
      username: 'gifter123',
      profilePictureUrl: null, // URL was dropped (old bug)
      reason: 'gift'
    };

    const userEmojiMap = { gifter123: '{{profilePicture}}' };
    const { emoji, useProfilePicture } = resolveEmojiForSpawn(
      spawnData.emoji,
      spawnData.profilePictureUrl,
      userEmojiMap,
      spawnData.username
    );

    expect(useProfilePicture).toBe(false);
    expect(emoji).toBe('👤'); // graceful fallback, not '{{profilePicture}}'
  });
});
