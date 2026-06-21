/**
 * Test for profile picture URL extraction from TikTok user objects
 * 
 * This test verifies that the extractProfilePictureUrl helper correctly handles
 * both legacy string URLs and new object format with url arrays.
 */

const EventEmitter = require('events');

// Mock database and logger
const mockDb = {
  prepare: () => ({ run: () => {} }),
  exec: () => {}
};

const mockLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {}
};

// Mock socket.io
const mockIo = {
  emit: () => {},
  on: () => {}
};

// Import the TikTok module
const TikTokConnector = require('../modules/tiktok.js');

describe('Profile Picture URL Extraction', () => {
  let connector;

  beforeEach(() => {
    connector = new TikTokConnector(mockIo, mockDb, mockLogger);
  });

  test('should extract URL from object with url array (Eulerstream format)', () => {
    const user = {
      uniqueId: 'testuser',
      nickname: 'Test User',
      profilePictureUrl: {
        url: ['https://example.com/profile1.jpg', 'https://example.com/profile2.jpg'],
        mUri: '100x100/tos-useast5-avt-0068-tx/ea61f81df5b9e990d6b970cee9566dc1',
        height: 0,
        width: 0,
        avgColor: '',
        imageType: 0,
        schema: '',
        isAnimated: false
      }
    };

    const result = connector.extractProfilePictureUrl(user);
    expect(result).toBe('https://example.com/profile1.jpg');
  });

  test('should extract URL from object with urlList array', () => {
    const user = {
      uniqueId: 'testuser',
      profilePictureUrl: {
        urlList: ['https://example.com/avatar.jpg'],
        height: 100,
        width: 100
      }
    };

    const result = connector.extractProfilePictureUrl(user);
    expect(result).toBe('https://example.com/avatar.jpg');
  });

  test('should return string URL if already a string', () => {
    const user = {
      uniqueId: 'testuser',
      profilePictureUrl: 'https://example.com/direct-url.jpg'
    };

    const result = connector.extractProfilePictureUrl(user);
    expect(result).toBe('https://example.com/direct-url.jpg');
  });

  test('should try alternative fields (avatarThumb, avatarLarger)', () => {
    const user = {
      uniqueId: 'testuser',
      avatarThumb: {
        url: ['https://example.com/thumb.jpg']
      }
    };

    const result = connector.extractProfilePictureUrl(user);
    expect(result).toBe('https://example.com/thumb.jpg');
  });

  test('should return empty string if no profile picture data found', () => {
    const user = {
      uniqueId: 'testuser',
      nickname: 'Test User'
    };

    const result = connector.extractProfilePictureUrl(user);
    expect(result).toBe('');
  });

  test('should return empty string if user is null', () => {
    const result = connector.extractProfilePictureUrl(null);
    expect(result).toBe('');
  });

  test('should return empty string if url array is empty', () => {
    const user = {
      uniqueId: 'testuser',
      profilePictureUrl: {
        url: [],
        mUri: 'some-uri'
      }
    };

    const result = connector.extractProfilePictureUrl(user);
    expect(result).toBe('');
  });

  test('should integrate properly in extractUserData', () => {
    const eventData = {
      user: {
        uniqueId: 'testuser123',
        nickname: 'Test User',
        userId: '12345',
        profilePictureUrl: {
          url: ['https://example.com/profile.jpg', 'https://example.com/profile-large.jpg'],
          mUri: '100x100/tos-useast5-avt-0068-tx/test123',
          height: 100,
          width: 100
        }
      },
      userIdentity: {
        isModeratorOfAnchor: false,
        isSubscriberOfAnchor: true
      }
    };

    const result = connector.extractUserData(eventData);
    
    expect(result.username).toBe('testuser123');
    expect(result.nickname).toBe('Test User');
    expect(result.profilePictureUrl).toBe('https://example.com/profile.jpg');
    expect(result.isSubscriber).toBe(true);
  });
});
