/**
 * WebGPU Engine Logger
 *
 * Winston logger wrapper following LTTH conventions.
 * Provides structured logging for the WebGPU engine.
 */

import { EngineLogger, LogLevel } from './types';

/**
 * Logger prefix for engine messages
 */
const ENGINE_PREFIX = '[WebGPU Engine]';

/**
 * Winston logger type (optional dependency)
 */
interface WinstonLogger {
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

/**
 * Plugin API logger interface
 */
interface PluginAPILogger {
  log(message: string, level?: LogLevel): void;
}

/**
 * Creates an engine logger from a Winston logger instance
 */
export function createEngineLogger(winstonLogger?: WinstonLogger): EngineLogger {
  if (winstonLogger) {
    return {
      error(message: string, ...args: unknown[]): void {
        const formattedArgs = args.length > 0 ? ` ${formatArgs(args)}` : '';
        winstonLogger.error(`${ENGINE_PREFIX} ${message}${formattedArgs}`);
      },
      warn(message: string, ...args: unknown[]): void {
        const formattedArgs = args.length > 0 ? ` ${formatArgs(args)}` : '';
        winstonLogger.warn(`${ENGINE_PREFIX} ${message}${formattedArgs}`);
      },
      info(message: string, ...args: unknown[]): void {
        const formattedArgs = args.length > 0 ? ` ${formatArgs(args)}` : '';
        winstonLogger.info(`${ENGINE_PREFIX} ${message}${formattedArgs}`);
      },
      debug(message: string, ...args: unknown[]): void {
        const formattedArgs = args.length > 0 ? ` ${formatArgs(args)}` : '';
        winstonLogger.debug(`${ENGINE_PREFIX} ${message}${formattedArgs}`);
      }
    };
  }

  // Fallback to no-op logger in production if no Winston logger provided
  return createNoOpLogger();
}

/**
 * Creates an engine logger from a Plugin API
 */
export function createEngineLoggerFromPluginAPI(pluginApi: PluginAPILogger): EngineLogger {
  return {
    error(message: string, ...args: unknown[]): void {
      const formattedArgs = args.length > 0 ? ` ${formatArgs(args)}` : '';
      pluginApi.log(`${ENGINE_PREFIX} ${message}${formattedArgs}`, 'error');
    },
    warn(message: string, ...args: unknown[]): void {
      const formattedArgs = args.length > 0 ? ` ${formatArgs(args)}` : '';
      pluginApi.log(`${ENGINE_PREFIX} ${message}${formattedArgs}`, 'warn');
    },
    info(message: string, ...args: unknown[]): void {
      const formattedArgs = args.length > 0 ? ` ${formatArgs(args)}` : '';
      pluginApi.log(`${ENGINE_PREFIX} ${message}${formattedArgs}`, 'info');
    },
    debug(message: string, ...args: unknown[]): void {
      const formattedArgs = args.length > 0 ? ` ${formatArgs(args)}` : '';
      pluginApi.log(`${ENGINE_PREFIX} ${message}${formattedArgs}`, 'debug');
    }
  };
}

/**
 * Creates a no-op logger (for production when logging is disabled)
 */
export function createNoOpLogger(): EngineLogger {
  const noOp = (): void => { /* no-op */ };
  return {
    error: noOp,
    warn: noOp,
    info: noOp,
    debug: noOp
  };
}

/**
 * Creates a console logger (for development/testing)
 */
export function createConsoleLogger(): EngineLogger {
  return {
    error(message: string, ...args: unknown[]): void {
      const formattedArgs = args.length > 0 ? ` ${formatArgs(args)}` : '';
      // Using console is allowed only in this development logger
      // eslint-disable-next-line no-console
      console.error(`${ENGINE_PREFIX} ${message}${formattedArgs}`);
    },
    warn(message: string, ...args: unknown[]): void {
      const formattedArgs = args.length > 0 ? ` ${formatArgs(args)}` : '';
      // eslint-disable-next-line no-console
      console.warn(`${ENGINE_PREFIX} ${message}${formattedArgs}`);
    },
    info(message: string, ...args: unknown[]): void {
      const formattedArgs = args.length > 0 ? ` ${formatArgs(args)}` : '';
      // eslint-disable-next-line no-console
      console.info(`${ENGINE_PREFIX} ${message}${formattedArgs}`);
    },
    debug(message: string, ...args: unknown[]): void {
      const formattedArgs = args.length > 0 ? ` ${formatArgs(args)}` : '';
      // eslint-disable-next-line no-console
      console.debug(`${ENGINE_PREFIX} ${message}${formattedArgs}`);
    }
  };
}

/**
 * Format additional arguments for logging
 */
function formatArgs(args: unknown[]): string {
  return args
    .map(arg => {
      if (arg instanceof Error) {
        return `${arg.message}\n${arg.stack || ''}`;
      }
      if (typeof arg === 'object' && arg !== null) {
        try {
          return JSON.stringify(arg);
        } catch {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');
}

/**
 * Log level priority map
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3
};

/**
 * Creates a filtered logger that only logs messages at or above a certain level
 */
export function createFilteredLogger(baseLogger: EngineLogger, minLevel: LogLevel): EngineLogger {
  const minPriority = LOG_LEVEL_PRIORITY[minLevel];

  return {
    error(message: string, ...args: unknown[]): void {
      if (LOG_LEVEL_PRIORITY.error <= minPriority) {
        baseLogger.error(message, ...args);
      }
    },
    warn(message: string, ...args: unknown[]): void {
      if (LOG_LEVEL_PRIORITY.warn <= minPriority) {
        baseLogger.warn(message, ...args);
      }
    },
    info(message: string, ...args: unknown[]): void {
      if (LOG_LEVEL_PRIORITY.info <= minPriority) {
        baseLogger.info(message, ...args);
      }
    },
    debug(message: string, ...args: unknown[]): void {
      if (LOG_LEVEL_PRIORITY.debug <= minPriority) {
        baseLogger.debug(message, ...args);
      }
    }
  };
}

/**
 * Default logger instance (can be replaced)
 */
let defaultLogger: EngineLogger = createNoOpLogger();

/**
 * Sets the default logger for the engine
 */
export function setDefaultLogger(logger: EngineLogger): void {
  defaultLogger = logger;
}

/**
 * Gets the default logger
 */
export function getDefaultLogger(): EngineLogger {
  return defaultLogger;
}
