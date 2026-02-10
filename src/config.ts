/**
 * Configuration module for @tinyland-inc/tinyland-analytics.
 *
 * Provides dependency injection for database access, environment flags,
 * and logging so the package has zero coupling to SvelteKit internals.
 */

/**
 * Adapter for executing SQL queries against a database.
 * Consumers supply their own implementation (e.g. wrapping postgres.js, Drizzle, Prisma, etc.).
 */
export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}

/**
 * Optional structured logger.
 * When omitted the package falls back to `console` for error-level messages only.
 */
export type LoggerFn = (level: string, msg: string, meta?: Record<string, unknown>) => void;

export interface AnalyticsConfig {
  /** Database adapter for converter queries */
  db?: DatabaseAdapter;
  /** Whether the host application is running in dev mode */
  isDev?: boolean;
  /** Base directory for analytics MDsveX content (defaults to `src/content/analytics`) */
  dataDir?: string;
  /** Structured logger callback */
  logger?: LoggerFn;
}

let config: AnalyticsConfig = {};

/** Merge additional configuration values into the current config. */
export function configureAnalytics(c: AnalyticsConfig): void {
  config = { ...config, ...c };
}

/** Return the current analytics configuration (read-only snapshot). */
export function getAnalyticsConfig(): Readonly<AnalyticsConfig> {
  return config;
}

/** Reset configuration to defaults (mainly useful in tests). */
export function resetAnalyticsConfig(): void {
  config = {};
}
