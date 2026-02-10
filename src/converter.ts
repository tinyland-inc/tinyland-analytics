import { writeAnalyticsToMDsveX } from './mdsvex-writer.js';
import type { AnalyticsData } from './mdsvex-writer.js';
import { getAnalyticsConfig } from './config.js';

interface PageView {
  id: string;
  path: string;
  timestamp: Date;
  user_agent?: string;
  referrer?: string;
  session_id?: string;
}

interface EventAnalytic {
  event_id: string;
  event_type: string;
  timestamp: Date;
  participants?: number;
  metadata?: any;
}

interface UserActivity {
  user_id: string;
  activity_type: string;
  timestamp: Date;
  metadata?: any;
}

/**
 * Obtain the configured database adapter, throwing if none was provided.
 */
function requireDb() {
  const db = getAnalyticsConfig().db;
  if (!db) {
    throw new Error(
      'No DatabaseAdapter configured. Call configureAnalytics({ db }) before using converter functions.'
    );
  }
  return db;
}

function getLogger() {
  return getAnalyticsConfig().logger;
}

/**
 * Convert page views from the database to MDsveX files.
 */
export async function convertPageViewsToMDsveX(startDate: Date, endDate: Date) {
  const db = requireDb();
  const logger = getLogger();

  try {
    // Query page views from database via adapter
    const pageViews = await db.query<PageView>(
      `SELECT id, path, timestamp, user_agent, referrer, session_id
       FROM page_views
       WHERE timestamp >= $1 AND timestamp <= $2
       ORDER BY timestamp`,
      [startDate, endDate]
    );

    // Group by month
    const viewsByMonth = new Map<string, AnalyticsData[]>();

    for (const view of pageViews) {
      const monthKey = `${view.timestamp.getFullYear()}-${view.timestamp.getMonth() + 1}`;

      if (!viewsByMonth.has(monthKey)) {
        viewsByMonth.set(monthKey, []);
      }

      viewsByMonth.get(monthKey)!.push({
        timestamp: view.timestamp,
        value: 1, // Each page view counts as 1
        metadata: {
          path: view.path,
          userAgent: view.user_agent,
          referrer: view.referrer,
          sessionId: view.session_id
        }
      });
    }

    // Write each month to MDsveX
    const results = [];
    for (const [monthKey, data] of viewsByMonth) {
      const [year, month] = monthKey.split('-').map(Number);
      const monthDate = new Date(year, month - 1);

      // Calculate unique paths and sessions
      const uniquePaths = new Set(data.map(d => d.metadata?.path)).size;
      const uniqueSessions = new Set(data.map(d => d.metadata?.sessionId).filter(Boolean)).size;

      const filePath = await writeAnalyticsToMDsveX(
        'page-views',
        monthDate,
        data,
        {
          uniquePaths,
          uniqueSessions,
          topPaths: getTopPaths(data)
        }
      );

      results.push(filePath);
    }

    return results;
  } catch (error) {
    if (logger) {
      logger('error', 'Failed to convert page views', { error });
    } else {
      console.error('Failed to convert page views:', error);
    }
    throw error;
  }
}

/**
 * Convert event analytics from the database to MDsveX files.
 */
export async function convertEventAnalyticsToMDsveX(startDate: Date, endDate: Date) {
  const db = requireDb();
  const logger = getLogger();

  try {
    // Query event analytics from database via adapter
    const eventAnalytics = await db.query<EventAnalytic>(
      `SELECT e.id as event_id, e.type as event_type, e.start_time as timestamp,
              e.current_participants as participants, e.analytics_metadata as metadata
       FROM event_details e
       WHERE e.start_time >= $1 AND e.start_time <= $2
       ORDER BY e.start_time`,
      [startDate, endDate]
    );

    // Group by month
    const eventsByMonth = new Map<string, AnalyticsData[]>();

    for (const event of eventAnalytics) {
      const monthKey = `${event.timestamp.getFullYear()}-${event.timestamp.getMonth() + 1}`;

      if (!eventsByMonth.has(monthKey)) {
        eventsByMonth.set(monthKey, []);
      }

      eventsByMonth.get(monthKey)!.push({
        timestamp: event.timestamp,
        value: event.participants || 0,
        metadata: {
          eventId: event.event_id,
          eventType: event.event_type,
          ...event.metadata
        }
      });
    }

    // Write each month to MDsveX
    const results = [];
    for (const [monthKey, data] of eventsByMonth) {
      const [year, month] = monthKey.split('-').map(Number);
      const monthDate = new Date(year, month - 1);

      // Calculate event type distribution
      const eventTypes = data.reduce((acc, d) => {
        const type = d.metadata?.eventType || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const totalParticipants = data.reduce((sum, d) => sum + d.value, 0);

      const filePath = await writeAnalyticsToMDsveX(
        'events',
        monthDate,
        data,
        {
          totalEvents: data.length,
          totalParticipants,
          eventTypes,
          averageParticipants: data.length > 0 ? Math.round(totalParticipants / data.length) : 0
        }
      );

      results.push(filePath);
    }

    return results;
  } catch (error) {
    if (logger) {
      logger('error', 'Failed to convert event analytics', { error });
    } else {
      console.error('Failed to convert event analytics:', error);
    }
    throw error;
  }
}

/**
 * Convert user activity from the database to MDsveX files.
 */
export async function convertUserActivityToMDsveX(startDate: Date, endDate: Date) {
  const db = requireDb();
  const logger = getLogger();

  try {
    // Query user activity from database via adapter
    const userActivities = await db.query<UserActivity>(
      `SELECT user_id, activity_type, timestamp, metadata
       FROM user_activities
       WHERE timestamp >= $1 AND timestamp <= $2
       ORDER BY timestamp`,
      [startDate, endDate]
    );

    // Group by month
    const activitiesByMonth = new Map<string, AnalyticsData[]>();

    for (const activity of userActivities) {
      const monthKey = `${activity.timestamp.getFullYear()}-${activity.timestamp.getMonth() + 1}`;

      if (!activitiesByMonth.has(monthKey)) {
        activitiesByMonth.set(monthKey, []);
      }

      activitiesByMonth.get(monthKey)!.push({
        timestamp: activity.timestamp,
        value: 1, // Each activity counts as 1
        metadata: {
          userId: activity.user_id,
          activityType: activity.activity_type,
          ...activity.metadata
        }
      });
    }

    // Write each month to MDsveX
    const results = [];
    for (const [monthKey, data] of activitiesByMonth) {
      const [year, month] = monthKey.split('-').map(Number);
      const monthDate = new Date(year, month - 1);

      // Calculate unique users and activity types
      const uniqueUsers = new Set(data.map(d => d.metadata?.userId)).size;
      const activityTypes = data.reduce((acc, d) => {
        const type = d.metadata?.activityType || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const filePath = await writeAnalyticsToMDsveX(
        'user-activity',
        monthDate,
        data,
        {
          uniqueUsers,
          activityTypes,
          averageActivitiesPerUser: uniqueUsers > 0 ? Math.round(data.length / uniqueUsers) : 0
        }
      );

      results.push(filePath);
    }

    return results;
  } catch (error) {
    if (logger) {
      logger('error', 'Failed to convert user activity', { error });
    } else {
      console.error('Failed to convert user activity:', error);
    }
    throw error;
  }
}

/**
 * Convert all analytics for a given time period.
 */
export async function convertAllAnalytics(startDate: Date, endDate: Date) {
  const logger = getLogger();

  const results = {
    pageViews: [] as string[],
    events: [] as string[],
    userActivity: [] as string[]
  };

  // Convert page views
  try {
    results.pageViews = await convertPageViewsToMDsveX(startDate, endDate);
  } catch (error) {
    if (logger) {
      logger('error', 'Failed to convert page views', { error });
    } else {
      console.error('Failed to convert page views:', error);
    }
  }

  // Convert event analytics
  try {
    results.events = await convertEventAnalyticsToMDsveX(startDate, endDate);
  } catch (error) {
    if (logger) {
      logger('error', 'Failed to convert event analytics', { error });
    } else {
      console.error('Failed to convert event analytics:', error);
    }
  }

  // Convert user activity
  try {
    results.userActivity = await convertUserActivityToMDsveX(startDate, endDate);
  } catch (error) {
    if (logger) {
      logger('error', 'Failed to convert user activity', { error });
    } else {
      console.error('Failed to convert user activity:', error);
    }
  }

  return results;
}

// Helper function to get top paths
function getTopPaths(data: AnalyticsData[], limit = 10): Array<{ path: string; count: number }> {
  const pathCounts = data.reduce((acc, d) => {
    const p = d.metadata?.path || 'unknown';
    acc[p] = (acc[p] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return Object.entries(pathCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([p, count]) => ({ path: p, count }));
}
