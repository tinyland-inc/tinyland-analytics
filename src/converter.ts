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




export async function convertPageViewsToMDsveX(startDate: Date, endDate: Date) {
  const db = requireDb();
  const logger = getLogger();

  try {
    
    const pageViews = await db.query<PageView>(
      `SELECT id, path, timestamp, user_agent, referrer, session_id
       FROM page_views
       WHERE timestamp >= $1 AND timestamp <= $2
       ORDER BY timestamp`,
      [startDate, endDate]
    );

    
    const viewsByMonth = new Map<string, AnalyticsData[]>();

    for (const view of pageViews) {
      const monthKey = `${view.timestamp.getFullYear()}-${view.timestamp.getMonth() + 1}`;

      if (!viewsByMonth.has(monthKey)) {
        viewsByMonth.set(monthKey, []);
      }

      viewsByMonth.get(monthKey)!.push({
        timestamp: view.timestamp,
        value: 1, 
        metadata: {
          path: view.path,
          userAgent: view.user_agent,
          referrer: view.referrer,
          sessionId: view.session_id
        }
      });
    }

    
    const results = [];
    for (const [monthKey, data] of viewsByMonth) {
      const [year, month] = monthKey.split('-').map(Number);
      const monthDate = new Date(year, month - 1);

      
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




export async function convertEventAnalyticsToMDsveX(startDate: Date, endDate: Date) {
  const db = requireDb();
  const logger = getLogger();

  try {
    
    const eventAnalytics = await db.query<EventAnalytic>(
      `SELECT e.id as event_id, e.type as event_type, e.start_time as timestamp,
              e.current_participants as participants, e.analytics_metadata as metadata
       FROM event_details e
       WHERE e.start_time >= $1 AND e.start_time <= $2
       ORDER BY e.start_time`,
      [startDate, endDate]
    );

    
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

    
    const results = [];
    for (const [monthKey, data] of eventsByMonth) {
      const [year, month] = monthKey.split('-').map(Number);
      const monthDate = new Date(year, month - 1);

      
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




export async function convertUserActivityToMDsveX(startDate: Date, endDate: Date) {
  const db = requireDb();
  const logger = getLogger();

  try {
    
    const userActivities = await db.query<UserActivity>(
      `SELECT user_id, activity_type, timestamp, metadata
       FROM user_activities
       WHERE timestamp >= $1 AND timestamp <= $2
       ORDER BY timestamp`,
      [startDate, endDate]
    );

    
    const activitiesByMonth = new Map<string, AnalyticsData[]>();

    for (const activity of userActivities) {
      const monthKey = `${activity.timestamp.getFullYear()}-${activity.timestamp.getMonth() + 1}`;

      if (!activitiesByMonth.has(monthKey)) {
        activitiesByMonth.set(monthKey, []);
      }

      activitiesByMonth.get(monthKey)!.push({
        timestamp: activity.timestamp,
        value: 1, 
        metadata: {
          userId: activity.user_id,
          activityType: activity.activity_type,
          ...activity.metadata
        }
      });
    }

    
    const results = [];
    for (const [monthKey, data] of activitiesByMonth) {
      const [year, month] = monthKey.split('-').map(Number);
      const monthDate = new Date(year, month - 1);

      
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




export async function convertAllAnalytics(startDate: Date, endDate: Date) {
  const logger = getLogger();

  const results = {
    pageViews: [] as string[],
    events: [] as string[],
    userActivity: [] as string[]
  };

  
  try {
    results.pageViews = await convertPageViewsToMDsveX(startDate, endDate);
  } catch (error) {
    if (logger) {
      logger('error', 'Failed to convert page views', { error });
    } else {
      console.error('Failed to convert page views:', error);
    }
  }

  
  try {
    results.events = await convertEventAnalyticsToMDsveX(startDate, endDate);
  } catch (error) {
    if (logger) {
      logger('error', 'Failed to convert event analytics', { error });
    } else {
      console.error('Failed to convert event analytics:', error);
    }
  }

  
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
