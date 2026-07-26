'use strict';

const {
  isOutgoingSocketEventAllowed
} = require('./public-overlay-registry');

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

function isApplicationEventAllowed(packet) {
  const eventName = packet?.data?.[0];
  if (typeof eventName !== 'string') {
    return true;
  }
  return isOutgoingSocketEventAllowed(eventName);
}

function createPublicOverlayAdapter(BaseAdapter) {
  return class PublicOverlayAdapter extends BaseAdapter {
    broadcast(packet, options) {
      return super.broadcast(
        packet,
        isApplicationEventAllowed(packet)
          ? options
          : restrictedOptions(options)
      );
    }

    broadcastWithAck(packet, options, clientCountCallback, ack) {
      return super.broadcastWithAck(
        packet,
        isApplicationEventAllowed(packet)
          ? options
          : restrictedOptions(options),
        clientCountCallback,
        ack
      );
    }
  };
}

module.exports = {
  PUBLIC_QUICK_TUNNEL_ROOM,
  createPublicOverlayAdapter
};
