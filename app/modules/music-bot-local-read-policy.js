'use strict';

const net = require('node:net');
const { hasForwardingHeaders } = require('./admin-auth');

function parseIPv6Bytes(address) {
  let normalized = String(address || '').trim().toLowerCase();
  if (normalized.startsWith('[') && normalized.endsWith(']')) normalized = normalized.slice(1, -1);
  if (normalized.includes('%') || net.isIP(normalized) !== 6) return null;

  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const parseHalf = half => half ? half.split(':') : [];
  const expandDottedTail = groups => {
    if (!groups.some(group => group.includes('.'))) return groups;
    const index = groups.findIndex(group => group.includes('.'));
    if (index !== groups.length - 1 || !net.isIPv4(groups[index])) return null;
    const octets = groups[index].split('.').map(Number);
    return [...groups.slice(0, index), ((octets[0] << 8) | octets[1]).toString(16), ((octets[2] << 8) | octets[3]).toString(16)];
  };
  const left = expandDottedTail(parseHalf(halves[0]));
  const right = expandDottedTail(halves.length === 2 ? parseHalf(halves[1]) : []);
  if (!left || !right) return null;

  let groups;
  if (halves.length === 2) {
    const zeros = 8 - left.length - right.length;
    if (zeros < 1) return null;
    groups = [...left, ...Array(zeros).fill('0'), ...right];
  } else {
    groups = left;
  }
  if (groups.length !== 8 || groups.some(group => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.flatMap(group => {
    const value = Number.parseInt(group, 16);
    return [value >> 8, value & 0xff];
  });
}

function isLoopbackRemoteAddress(address) {
  let normalized = String(address || '').trim();
  if (normalized.startsWith('[') && normalized.endsWith(']')) normalized = normalized.slice(1, -1);
  if (net.isIPv4(normalized)) return normalized.split('.')[0] === '127';
  const bytes = parseIPv6Bytes(normalized);
  if (!bytes) return false;
  if (bytes.slice(0, 15).every(byte => byte === 0) && bytes[15] === 1) return true;
  const mappedV4 = bytes.slice(0, 10).every(byte => byte === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  return mappedV4 && bytes[12] === 127;
}

function isMusicBotConfigPath(originalUrl) {
  const pathname = String(originalUrl || '').split(/[?#]/, 1)[0];
  return /^\/api\/plugins\/music-bot\/config\/?$/i.test(pathname);
}

function createMusicBotLocalReadPolicy() {
  return function musicBotLocalReadPolicy(req, res, next) {
    const method = String(req.method || '').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') return next();
    if (isMusicBotConfigPath(req.originalUrl || req.url)) return next();

    const remoteAddress = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
    if (!isLoopbackRemoteAddress(remoteAddress) || hasForwardingHeaders(req)) {
      return res.status(403).json({
        success: false,
        code: 'MUSIC_BOT_LOCAL_READS_ONLY',
        error: 'Music Bot data endpoints are only available from a local connection'
      });
    }
    return next();
  };
}

module.exports = { createMusicBotLocalReadPolicy, isLoopbackRemoteAddress, isMusicBotConfigPath };
