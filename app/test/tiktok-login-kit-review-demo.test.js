const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '..', '..');
const videoPath = path.join(repositoryRoot, 'assets', 'tiktok-login-kit-review-demo.mp4');
const storyboardPath = path.join(repositoryRoot, 'assets', 'tiktok-login-kit-review-demo.md');

describe('TikTok Login Kit review demo assets', () => {
  test('ships an upload-sized MP4 and a storyboard covering the return flow', () => {
    expect(fs.existsSync(videoPath)).toBe(true);
    const bytes = fs.statSync(videoPath).size;
    expect(bytes).toBeGreaterThanOrEqual(1024);
    expect(bytes).toBeLessThanOrEqual(50 * 1024 * 1024);

    expect(fs.existsSync(storyboardPath)).toBe(true);
    const storyboard = fs.readFileSync(storyboardPath, 'utf8');
    expect(storyboard).toContain('TikTok Login Kit');
    expect(storyboard).toContain('return to LTTH');
    expect(storyboard).toContain('test-version mockup');
    expect(storyboard).toContain('Sandbox test account');
    expect(storyboard).toContain('not a production integration');
    expect(storyboard).not.toContain('Production integration is available');
  });
});
