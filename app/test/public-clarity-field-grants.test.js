'use strict';
const { isHttpAllowed } = require('../modules/public-overlay-registry');
const { createPublicOverlayMiddleware, isApprovedQuickTunnelRequest, protectPublicSocket } = require('../modules/public-overlay-access');
const { createPublicOverlayAdapter, PUBLIC_QUICK_TUNNEL_ROOM } = require('../modules/public-overlay-socket-adapter');
const HOST = 'synthetic-overlay.trycloudflare.com';
const POLICY = { getPublicSurfaceSnapshot: () => ({ publicMode: true, publicSurface: true, policyInvalid: false }), isClosedBetaId: () => false };
function dispatch(host, pathname) {
  const result = { statusCode: 200, body: undefined, nextCalled: false };
  const req = { headers: { host }, method: 'GET', originalUrl: pathname, url: pathname };
  const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  createPublicOverlayMiddleware({ logger: { warn: jest.fn() } })(req, res, () => { result.nextCalled = true; });
  if (result.nextCalled) res.json({ local: true });
  return { statusCode: res.statusCode, body: res.body, nextCalled: result.nextCalled };
}
function socket(host = HOST) { return { handshake: { headers: { host } }, data: {}, join: jest.fn(), use: jest.fn(), emit: jest.fn(() => true) }; }
class RecordingAdapter { constructor() { this.calls = []; } broadcast(packet, options) { this.calls.push({ packet, options }); } broadcastWithAck(packet, options) { this.calls.push({ packet, options }); } }
describe('E-only public ClarityHUD field-grant candidate', () => {
  test('QuickTunnel denies Clarity state/settings while preserving localhost, Viewer-XP and Sidekick paths', () => {
    for (const route of ['/api/clarityhud/state/full', '/api/clarityhud/settings/full']) {
      expect(isHttpAllowed({ method: 'GET', pathname: route })).toBe(true);
      expect(isApprovedQuickTunnelRequest({ method: 'GET', pathname: route })).toBe(false);
      expect(dispatch(HOST, route)).toEqual({ statusCode: 404, body: { error: 'Not found' }, nextCalled: false });
      expect(dispatch('127.0.0.1:3000', route)).toEqual({ statusCode: 200, body: { local: true }, nextCalled: true });
    }
    expect(isApprovedQuickTunnelRequest({ method: 'GET', pathname: '/overlay/viewer-xp/xp-bar' })).toBe(true);
    expect(isApprovedQuickTunnelRequest({ method: 'GET', pathname: '/overlay/sidekick/hud' })).toBe(true);
    expect(isApprovedQuickTunnelRequest({ method: 'GET', pathname: '/api/sidekick/public-events' })).toBe(true);
  });
  test('public socket denies generic Clarity payloads but keeps approved SuperFan and Viewer-XP DTOs', () => {
    const s = socket(), emit = s.emit;
    protectPublicSocket({ socket: s, logger: { warn: jest.fn() }, pluginReleasePolicy: POLICY });
    for (const e of ['clarityhud.settings.full','clarityhud.update.chat','clarityhud.update.gift','clarityhud.update.follow','clarityhud.update.subscribe','clarityhud.update.join','clarityhud:multi:chat','clarityhud:multi:gift']) {
      expect(s.emit(e, { message:'CANARY_RAW_CHAT', uniqueId:'CANARY_UID', raw:{userId:'CANARY_ID'}, isModerator:true, settings:{private:true}, image:'http://private.invalid' })).toBe(false);
    }
    expect(emit).not.toHaveBeenCalled();
    const sf = { eventType:'superfan', displayName:'Synthetic SuperFan', level:4, profilePictureUrl:'https://p16-sign-va.tiktokcdn.com/avatar.png' };
    expect(s.emit('clarityhud.update.superfan-display', sf)).toBe(true);
    expect(emit).toHaveBeenLastCalledWith('clarityhud.update.superfan-display', sf);
    const xp = { username:'Approved XP', name_color:'#abc', title:'Guest', level:3, xp_progress:2, xp_for_next_level:8, xp_progress_percent:25, profilePictureUrl:null, coin_balance:999 };
    expect(s.emit('viewer-xp:public-profile', xp)).toBe(true);
    expect(emit.mock.calls[1][1]).not.toHaveProperty('coin_balance');
    expect(s.emit('clarityhud.update.superfan-display', { ...sf, raw:{uid:'CANARY_ID'}, settings:{private:true} })).toBe(false);
    expect(emit).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(emit.mock.calls)).not.toMatch(/CANARY_(?:RAW_CHAT|UID|ID)/);
  });
  test('adapter withholds generic Clarity only from public room and projects approved SuperFan', () => {
    const C = createPublicOverlayAdapter(RecordingAdapter, { pluginReleasePolicy: POLICY });
    const a = new C({ name:'/' }), options = { rooms:new Set(), except:new Set() };
    const raw = { message:'CANARY_CHAT', user:{uniqueId:'CANARY_UID'}, raw:{userId:'CANARY_ID'} };
    a.broadcast({ data:['clarityhud.update.chat',raw] }, options);
    expect(a.calls).toHaveLength(1);
    expect(a.calls[0].packet.data[1]).toBe(raw);
    expect(a.calls[0].options.except.has(PUBLIC_QUICK_TUNNEL_ROOM)).toBe(true);
    expect(a.calls[0].options.rooms.has(PUBLIC_QUICK_TUNNEL_ROOM)).toBe(false);
    const sf = { eventType:'superfan-join', displayName:'Synthetic Viewer', level:2 };
    a.broadcast({ data:['clarityhud.update.superfan-display',sf] }, options);
    expect(a.calls).toHaveLength(3);
    expect(a.calls[1].options.except.has(PUBLIC_QUICK_TUNNEL_ROOM)).toBe(true);
    expect(a.calls[2].options.rooms).toEqual(new Set([PUBLIC_QUICK_TUNNEL_ROOM]));
    expect(a.calls[2].packet.data).toEqual(['clarityhud.update.superfan-display',sf]);
    expect(JSON.stringify(a.calls[2].packet)).not.toMatch(/CANARY_(?:CHAT|UID|ID)/);
  });
});