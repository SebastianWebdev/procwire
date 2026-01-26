/**
 * Handler registry for @procwire/sdk
 * @packageDocumentation
 */

import type { Handler, NotificationHandler } from "../types.js";
import type { RegisteredHandler, RegisteredNotificationHandler } from "./types.js";
import { validateUserMethod } from "../protocol/reserved.js";

/**
 * Error thrown when handler registration fails.
 */
export class HandlerRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HandlerRegistrationError";
  }
}

/**
 * Registry for method handlers.
 * Provides O(1) lookup and prevents duplicate registrations.
 *
 * @example
 * ```ts
 * const registry = new HandlerRegistry();
 *
 * registry.register('echo', (params) => params);
 * registry.register('add', ({ a, b }) => ({ sum: a + b }));
 *
 * const handler = registry.get('echo');
 * if (handler) {
 *   const result = await handler({ message: 'hello' }, context);
 * }
 * ```
 */
export class HandlerRegistry {
  private readonly handlers = new Map<string, RegisteredHandler>();
  private readonly notificationHandlers = new Map<string, RegisteredNotificationHandler>();

  /**
   * Register a request handler for a method.
   *
   * @param method - Method name (cannot be reserved)
   * @param handler - Handler function
   * @throws {HandlerRegistrationError} If method is reserved or already registered
   *
   * @example
   * ```ts
   * registry.register('greet', (params: { name: string }) => {
   *   return { message: `Hello, ${params.name}!` };
   * });
   * ```
   */
  register<TParams = unknown, TResult = unknown>(
    method: string,
    handler: Handler<TParams, TResult>,
  ): void {
    validateUserMethod(method);

    if (this.handlers.has(method)) {
      throw new HandlerRegistrationError(
        `Handler already registered for method '${method}'. ` +
          `Use remove() first if you want to replace it.`,
      );
    }

    this.handlers.set(method, {
      handler: handler as Handler,
      method,
      registeredAt: Date.now(),
    });
  }

  /**
   * Register a notification handler for a method.
   * Notification handlers don't return values.
   *
   * @param method - Method name (cannot be reserved)
   * @param handler - Handler function
   * @throws {HandlerRegistrationError} If method is reserved or already registered
   *
   * @example
   * ```ts
   * registry.registerNotification('log', (params: { message: string }) => {
   *   console.log(params.message);
   * });
   * ```
   */
  registerNotification<TParams = unknown>(
    method: string,
    handler: NotificationHandler<TParams>,
  ): void {
    validateUserMethod(method);

    if (this.notificationHandlers.has(method)) {
      throw new HandlerRegistrationError(
        `Notification handler already registered for method '${method}'.`,
      );
    }

    this.notificationHandlers.set(method, {
      handler: handler as NotificationHandler,
      method,
      registeredAt: Date.now(),
    });
  }

  /**
   * Get a request handler by method name.
   *
   * @param method - Method name
   * @returns Handler function or undefined if not found
   */
  get<TParams = unknown, TResult = unknown>(method: string): Handler<TParams, TResult> | undefined {
    const registered = this.handlers.get(method);
    return registered?.handler as Handler<TParams, TResult> | undefined;
  }

  /**
   * Get a notification handler by method name.
   *
   * @param method - Method name
   * @returns Handler function or undefined if not found
   */
  getNotification<TParams = unknown>(method: string): NotificationHandler<TParams> | undefined {
    const registered = this.notificationHandlers.get(method);
    return registered?.handler as NotificationHandler<TParams> | undefined;
  }

  /**
   * Check if a request handler exists for a method.
   *
   * @param method - Method name
   * @returns `true` if handler exists
   */
  has(method: string): boolean {
    return this.handlers.has(method);
  }

  /**
   * Check if a notification handler exists for a method.
   *
   * @param method - Method name
   * @returns `true` if handler exists
   */
  hasNotification(method: string): boolean {
    return this.notificationHandlers.has(method);
  }

  /**
   * Remove a request handler.
   *
   * @param method - Method name
   * @returns `true` if handler was removed, `false` if not found
   */
  remove(method: string): boolean {
    return this.handlers.delete(method);
  }

  /**
   * Remove a notification handler.
   *
   * @param method - Method name
   * @returns `true` if handler was removed, `false` if not found
   */
  removeNotification(method: string): boolean {
    return this.notificationHandlers.delete(method);
  }

  /**
   * Get all registered request method names.
   *
   * @returns Array of method names
   */
  methods(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get all registered notification method names.
   *
   * @returns Array of method names
   */
  notificationMethods(): string[] {
    return Array.from(this.notificationHandlers.keys());
  }

  /**
   * Get number of registered request handlers.
   */
  get size(): number {
    return this.handlers.size;
  }

  /**
   * Get number of registered notification handlers.
   */
  get notificationSize(): number {
    return this.notificationHandlers.size;
  }

  /**
   * Clear all handlers (both request and notification).
   */
  clear(): void {
    this.handlers.clear();
    this.notificationHandlers.clear();
  }
}
