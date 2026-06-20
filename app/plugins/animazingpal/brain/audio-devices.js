const { execFile } = require('child_process');

function parseJsonArray(value) {
  if (!value || !value.trim()) return [];
  const parsed = JSON.parse(value);
  return Array.isArray(parsed) ? parsed : [parsed];
}

function isPlaybackEndpoint(device) {
  return device?.Status === 'OK'
    && typeof device.FriendlyName === 'string'
    && typeof device.InstanceId === 'string'
    && device.InstanceId.includes('{0.0.0.');
}

function listAudioOutputDevices() {
  if (process.platform !== 'win32') return Promise.resolve([]);

  const script = [
    'Get-PnpDevice -Class AudioEndpoint',
    "Where-Object { $_.Status -eq 'OK' -and $_.InstanceId -like '*{0.0.0.*' }",
    'Select-Object FriendlyName,InstanceId,Status',
    'ConvertTo-Json -Depth 2'
  ].join(' | ');

  return new Promise(resolve => {
    execFile('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
      windowsHide: true,
      timeout: 5000,
      maxBuffer: 1024 * 1024
    }, (error, stdout) => {
      if (error) return resolve([]);
      try {
        const seen = new Set();
        const devices = parseJsonArray(stdout)
          .filter(isPlaybackEndpoint)
          .map(device => device.FriendlyName.trim())
          .filter(label => {
            const key = label.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          })
          .map(label => ({ deviceId: label, label, source: 'system' }));
        resolve(devices);
      } catch {
        resolve([]);
      }
    });
  });
}

module.exports = { listAudioOutputDevices };
