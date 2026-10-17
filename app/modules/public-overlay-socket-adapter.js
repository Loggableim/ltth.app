'use strict';

const {
  isOutgoingSocketEventAllowed
} = require('./public-overlay-registry');
const { projectPublicOverlayPayload } = require('./public-overlay-payload-projection');
const { createPublicReleaseEventGuard } = require('./public-overlay-release-event-policy');
const { isPublicClarityEventAllowed } = require('./public-overlay-event-policy');

const PUBLIC_QUICK_TUNNEL_ROOM = '__ltth_public_quick_tunnel__';

function restrictedOptions(options = {}) {
  return {
    ...options,
    except: new Set([
      ...(options.except || []),
      PUBLIC_QUICK_TUNNEL_ROOM
    ])
  };
}

function publicOnlyOptions(options = {}) {
  return {
    ...options,
    rooms: new Set([PUBLIC_QUICK_TUNNEL_ROOM]),
    except: new Set(options.except || [])
  };
}

function targetsPublicRoom(options = {}) {
  const rooms = options.rooms || new Set();
  const except = options.except || new Set();
  return (!rooms.size || rooms.has(PUBLIC_QUICK_TUNNEL_ROOM))
    && !except.has(PUBLIC_QUICK_TUNNEL_ROOM);
}

function isApplicationEventAllowed(packet) {
  const eventName = packet?.data?.[0];
  if (typeof eventName !== 'string') {
    return true;
  }
  return isOutgoingSocketEventAllowed(eventName) && isPublicClarityEventAllowed(eventName);
}

function createPublicOverlayAdapter(BaseAdapter, { pluginReleasePolicy } = {}) {
  const releaseEventGuard = createPublicReleaseEventGuard(pluginReleasePolicy);
  return class PublicOverlayAdapter extends BaseAdapter {
    broadcast(packet, options) {
      if (!isApplicationEventAllowed(packet)) {
        return super.broadcast(packet, restrictedOptions(options));
      }

      if (!targetsPublicRoom(options)) {
        return super.broadcast(packet, options);
      }

      const eventName = packet?.data?.[0];
      if (!releaseEventGuard('outgoing', eventName)) {
        return super.broadcast(packet, restrictedOptions(options));
      }
      const projection = typeof eventName === 'string'
        ? projectPublicOverlayPayload(eventName, packet.data[1])
        : undefined;
      if (projection === undefined || projection === null || packet.data.length !== 2) {
        return super.broadcast(packet, restrictedOptions(options));
      }

      // Local clients retain the full application payload. Only the public
      // Quick Tunnel room receives the renderer-specific field projection.
      const localResult = super.broadcast(packet, restrictedOptions(options));
      const publicPacket = {
        ...packet,
        data: [eventName, projection]
      };
      super.broadcast(publicPacket, publicOnlyOptions(options));
      return localResult;
    }

    broadcastWithAck(packet, options, clientCountCallback, ack) {
      if (!isApplicationEventAllowed(packet)) {
        return super.broadcastWithAck(packet, restrictedOptions(options), clientCountCallback, ack);
      }
      if (!targetsPublicRoom(options)) {
        return super.broadcastWithAck(packet, options, clientCountCallback, ack);
      }

      // Public-room acknowledgements have no reviewed response contract, so
      // none of them may carry an unprojected packet to the tunnel.
      if (!releaseEventGuard('outgoing', packet?.data?.[0])) {
        return super.broadcastWithAck(packet, restrictedOptions(options), clientCountCallback, ack);
      }

      const eventName = packet?.data?.[0];
      const projection = typeof eventName === 'string'
        ? projectPublicOverlayPayload(eventName, packet.data[1])
        : undefined;
      // These public events have no repository acknowledgement consumers. Fail
      // closed for ack broadcasts until their split-room ack contract is defined.
      const broadcastOptions = restrictedOptions(options);
      return super.broadcastWithAck(packet, broadcastOptions, clientCountCallback, ack);
    }
  };
}

module.exports = {
  PUBLIC_QUICK_TUNNEL_ROOM,
  createPublicOverlayAdapter
};
