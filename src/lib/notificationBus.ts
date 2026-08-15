import { EventEmitter } from "node:events";

/**
 * In-process fan-out from "something happened" to any SSE stream the recipient
 * currently has open. Deliberately not a delivery guarantee — every
 * notification is persisted first, so a client that was offline still sees it
 * on next load; this only makes an open tab update without polling.
 *
 * A single API process serves the whole team, so an in-memory emitter is
 * sufficient. Running multiple instances would need a shared broker.
 */
class NotificationBus extends EventEmitter {
  publish(userId: string, payload: unknown) {
    this.emit(userId, payload);
  }

  subscribe(userId: string, listener: (payload: unknown) => void) {
    this.on(userId, listener);
    return () => this.off(userId, listener);
  }
}

export const notificationBus = new NotificationBus();
// One listener per open tab per user; the default cap of 10 is too low for a
// team member with several tabs open.
notificationBus.setMaxListeners(200);
