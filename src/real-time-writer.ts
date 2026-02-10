import { writeAnalyticsToMDsveX, readAnalyticsFromMDsveX } from './mdsvex-writer.js';
import { getAnalyticsConfig } from './config.js';

// In-memory buffer for batching analytics writes
const analyticsBuffer = {
  'page-views': [] as Array<{ timestamp: Date; value: number; metadata?: any }>,
  'events': [] as Array<{ timestamp: Date; value: number; metadata?: any }>,
  'user-activity': [] as Array<{ timestamp: Date; value: number; metadata?: any }>
};

function isDev(): boolean {
  return getAnalyticsConfig().isDev ?? false;
}

// Write interval (5 minutes in production, 1 minute in dev)
function getWriteInterval(): number {
  return isDev() ? 60000 : 300000;
}

// Start periodic write process
let writeInterval: NodeJS.Timeout | null = null;

/**
 * Start the real-time analytics writer.
 */
export function startAnalyticsWriter() {
  if (writeInterval) return;

  writeInterval = setInterval(async () => {
    await flushAnalyticsBuffer();
  }, getWriteInterval());

  if (isDev()) {
    if (process.env.NODE_ENV === 'development') console.log('Analytics writer started (writing every', getWriteInterval() / 1000, 'seconds)');
  }
}

/**
 * Stop the real-time analytics writer.
 */
export function stopAnalyticsWriter() {
  if (writeInterval) {
    clearInterval(writeInterval);
    writeInterval = null;
  }
}

/**
 * Track a page view.
 */
export async function trackPageView(
  path: string,
  sessionId?: string,
  userAgent?: string,
  referrer?: string
) {
  analyticsBuffer['page-views'].push({
    timestamp: new Date(),
    value: 1,
    metadata: {
      path,
      sessionId,
      userAgent,
      referrer
    }
  });

  // In dev mode, write immediately for testing
  if (isDev() && analyticsBuffer['page-views'].length >= 10) {
    await flushAnalyticsBuffer('page-views');
  }
}

/**
 * Track an event.
 */
export async function trackEvent(
  eventId: string,
  eventType: string,
  participants: number = 0,
  metadata?: any
) {
  analyticsBuffer['events'].push({
    timestamp: new Date(),
    value: participants,
    metadata: {
      eventId,
      eventType,
      ...metadata
    }
  });

  // In dev mode, write immediately for testing
  if (isDev() && analyticsBuffer['events'].length >= 5) {
    await flushAnalyticsBuffer('events');
  }
}

/**
 * Track user activity.
 */
export async function trackUserActivity(
  userId: string,
  activityType: string,
  metadata?: any
) {
  analyticsBuffer['user-activity'].push({
    timestamp: new Date(),
    value: 1,
    metadata: {
      userId,
      activityType,
      ...metadata
    }
  });

  // In dev mode, write immediately for testing
  if (isDev() && analyticsBuffer['user-activity'].length >= 10) {
    await flushAnalyticsBuffer('user-activity');
  }
}

/**
 * Flush analytics buffer to MDsveX files.
 */
export async function flushAnalyticsBuffer(
  type?: 'page-views' | 'events' | 'user-activity'
) {
  const types = type ? [type] : ['page-views', 'events', 'user-activity'] as const;

  for (const t of types) {
    const buffer = analyticsBuffer[t];
    if (buffer.length === 0) continue;

    try {
      // Group by month
      const byMonth = new Map<string, typeof buffer>();

      for (const item of buffer) {
        const year = item.timestamp.getFullYear();
        const month = item.timestamp.getMonth() + 1;
        const key = `${year}-${month}`;

        if (!byMonth.has(key)) {
          byMonth.set(key, []);
        }
        byMonth.get(key)!.push(item);
      }

      // Write each month
      for (const [monthKey, data] of byMonth) {
        const [year, month] = monthKey.split('-').map(Number);

        // Read existing data for the month
        const existing = await readAnalyticsFromMDsveX(t, year, month);

        // Merge with existing data if present
        if (existing) {
          await writeAnalyticsToMDsveX(
            t,
            new Date(year, month - 1),
            data,
            {
              // Preserve existing frontmatter and update counts
              totalCount: (existing.frontmatter.totalCount || 0) + data.reduce((sum, d) => sum + d.value, 0),
              lastUpdated: new Date().toISOString()
            }
          );
        } else {
          // Write new file
          await writeAnalyticsToMDsveX(
            t,
            new Date(year, month - 1),
            data
          );
        }
      }

      // Clear buffer
      analyticsBuffer[t] = [];

      if (isDev()) {
        if (process.env.NODE_ENV === 'development') console.log(`Flushed ${buffer.length} ${t} analytics to MDsveX`);
      }
    } catch (error) {
      const logger = getAnalyticsConfig().logger;
      if (logger) {
        logger('error', `Failed to flush ${t} analytics`, { error });
      } else {
        console.error(`Failed to flush ${t} analytics:`, error);
      }
    }
  }
}

/**
 * Get current buffer stats.
 */
export function getBufferStats() {
  return {
    'page-views': analyticsBuffer['page-views'].length,
    'events': analyticsBuffer['events'].length,
    'user-activity': analyticsBuffer['user-activity'].length
  };
}

/**
 * Clear the analytics buffer without flushing (useful in tests).
 */
export function clearAnalyticsBuffer() {
  analyticsBuffer['page-views'] = [];
  analyticsBuffer['events'] = [];
  analyticsBuffer['user-activity'] = [];
}

// Ensure buffer is flushed on process exit
if (typeof process !== 'undefined') {
  process.on('beforeExit', async () => {
    await flushAnalyticsBuffer();
  });

  process.on('SIGINT', async () => {
    await flushAnalyticsBuffer();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await flushAnalyticsBuffer();
    process.exit(0);
  });
}
