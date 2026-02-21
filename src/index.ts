// Configuration & dependency injection
export {
  configureAnalytics,
  getAnalyticsConfig,
  resetAnalyticsConfig,
} from './config.js';

export type {
  AnalyticsConfig,
  DatabaseAdapter,
  LoggerFn,
} from './config.js';

// MDsveX writer
export {
  writeAnalyticsToMDsveX,
  readAnalyticsFromMDsveX,
  listAnalyticsFiles,
} from './mdsvex-writer.js';

export type {
  AnalyticsData,
  AnalyticsFrontmatter,
} from './mdsvex-writer.js';

// Query service
export {
  queryAnalytics,
  getTrendingAnalytics,
  getTopItems,
} from './query-service.js';

export type {
  AnalyticsQuery,
  AnalyticsResult,
} from './query-service.js';

// Real-time writer
export {
  startAnalyticsWriter,
  stopAnalyticsWriter,
  trackPageView,
  trackEvent,
  trackUserActivity,
  flushAnalyticsBuffer,
  getBufferStats,
  clearAnalyticsBuffer,
} from './real-time-writer.js';

// Converter (DB -> MDsveX)
export {
  convertPageViewsToMDsveX,
  convertEventAnalyticsToMDsveX,
  convertUserActivityToMDsveX,
  convertAllAnalytics,
} from './converter.js';
