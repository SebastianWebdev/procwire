import type { Unsubscribe } from "./disposables.js";

/**
 * Event handler function.
 */
export type EventHandler<T = unknown> = (data: T) => void;

/**
 * Map of event names to their payload types.
 * Usage: interface MyEvents extends EventMap { 'data': Buffer; 'error': Error; }
 */
export interface EventMap {
  [event: string]: unknown;
}

/**
 * Type-safe event emitter with Unsubscribe pattern.
 * Zero dependencies, designed for transport and channel layers.
 *
 * @example
 * interface MyEvents extends EventMap {
 *   'connect': void;
 *   'data': Buffer;
 *   'error': Error;
 * }
 *
 * const emitter = new EventEmitter<MyEvents>();
 * const unsub = emitter.on('data', (buf) => console.log(buf));
 * emitter.emit('data', Buffer.from('hello'));
 * unsub(); // cleanup
 */
export class EventEmitter<TEventMap extends EventMap = EventMap> {
  private readonly listeners = new Map<keyof TEventMap, Set<EventHandler>>();

  /**
   * Subscribes to an event.
   * @returns Unsubscribe function to remove the listener
   */
  on<K extends keyof TEventMap>(event: K, handler: EventHandler<TEventMap[K]>): Unsubscribe {
    let handlers = this.listeners.get(event);
    if (!handlers) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }
    handlers.add(handler as EventHandler);

    // Return unsubscribe function
    return () => {
      this.off(event, handler);
    };
  }

  /**
   * Subscribes to an event that fires only once.
   * @returns Unsubscribe function (in case you want to cancel before it fires)
   */
  once<K extends keyof TEventMap>(event: K, handler: EventHandler<TEventMap[K]>): Unsubscribe {
    const wrapper = (data: TEventMap[K]) => {
      this.off(event, wrapper as EventHandler<TEventMap[K]>);
      handler(data);
    };
    return this.on(event, wrapper as EventHandler<TEventMap[K]>);
  }

  /**
   * Removes a specific event listener.
   */
  off<K extends keyof TEventMap>(event: K, handler: EventHandler<TEventMap[K]>): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      handlers.delete(handler as EventHandler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    }
  }

  /**
   * Emits an event to all registered listeners.
   */
  emit<K extends keyof TEventMap>(event: K, data: TEventMap[K]): void {
    const handlers = this.listeners.get(event);
    if (handlers) {
      // Clone set to avoid issues if handler unsubscribes during emit
      for (const handler of Array.from(handlers)) {
        try {
          handler(data);
        } catch (error) {
          // Emit error event if available, otherwise log
          console.error(`Error in event handler for '${String(event)}':`, error);
        }
      }
    }
  }

  /**
   * Removes all listeners for a specific event, or all events if no event specified.
   */
  removeAllListeners<K extends keyof TEventMap>(event?: K): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  /**
   * Returns the number of listeners for a specific event.
   */
  listenerCount<K extends keyof TEventMap>(event: K): number {
    const handlers = this.listeners.get(event);
    return handlers ? handlers.size : 0;
  }
}
