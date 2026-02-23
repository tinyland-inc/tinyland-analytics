import { readAnalyticsFromMDsveX, listAnalyticsFiles } from './mdsvex-writer.js';

export interface AnalyticsQuery {
  type?: 'page-views' | 'events' | 'user-activity';
  startDate?: Date;
  endDate?: Date;
  groupBy?: 'day' | 'week' | 'month' | 'year';
  metrics?: string[];
}

export interface AnalyticsResult {
  type: string;
  period: { start: Date; end: Date };
  data: Array<{
    date: Date;
    value: number;
    metadata?: any;
  }>;
  summary: {
    total: number;
    average: number;
    peak: { date: Date; value: number };
    [key: string]: any;
  };
}




export async function queryAnalytics(query: AnalyticsQuery): Promise<AnalyticsResult[]> {
  const results: AnalyticsResult[] = [];
  const types = query.type ? [query.type] : ['page-views', 'events', 'user-activity'] as const;

  for (const type of types) {
    const files = await listAnalyticsFiles(type);
    const relevantFiles = filterFilesByDateRange(files, query.startDate, query.endDate);

    if (relevantFiles.length === 0) continue;

    const typeData: Array<{ date: Date; value: number; metadata?: any }> = [];
    let totalValue = 0;
    let peakValue = 0;
    let peakDate = new Date();

    
    for (const file of relevantFiles) {
      const analytics = await readAnalyticsFromMDsveX(type, file.year, file.month);
      if (!analytics) continue;

      
      const monthTotal = analytics.frontmatter.totalCount || 0;
      const monthDate = new Date(file.year, file.month - 1);

      typeData.push({
        date: monthDate,
        value: monthTotal,
        metadata: {
          uniqueCount: analytics.frontmatter.uniqueCount,
          averageDaily: analytics.frontmatter.averageDaily,
          peakDay: analytics.frontmatter.peakDay,
          peakHour: analytics.frontmatter.peakHour
        }
      });

      totalValue += monthTotal;
      if (monthTotal > peakValue) {
        peakValue = monthTotal;
        peakDate = monthDate;
      }
    }

    
    const groupedData = query.groupBy ? groupData(typeData, query.groupBy) : typeData;

    
    const sortedDates = groupedData.map(d => d.date).sort((a, b) => a.getTime() - b.getTime());
    const period = {
      start: sortedDates[0] || new Date(),
      end: sortedDates[sortedDates.length - 1] || new Date()
    };

    results.push({
      type,
      period,
      data: groupedData,
      summary: {
        total: totalValue,
        average: groupedData.length > 0 ? Math.round(totalValue / groupedData.length) : 0,
        peak: { date: peakDate, value: peakValue },
        dataPoints: groupedData.length
      }
    });
  }

  return results;
}




export async function getTrendingAnalytics(
  type: 'page-views' | 'events' | 'user-activity',
  days: number = 30
): Promise<{
  trend: 'up' | 'down' | 'stable';
  percentageChange: number;
  currentPeriod: { total: number; average: number };
  previousPeriod: { total: number; average: number };
}> {
  const endDate = new Date();
  const midDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
  const startDate = new Date(endDate.getTime() - 2 * days * 24 * 60 * 60 * 1000);

  
  const currentResults = await queryAnalytics({
    type,
    startDate: midDate,
    endDate
  });

  
  const previousResults = await queryAnalytics({
    type,
    startDate,
    endDate: midDate
  });

  const current = currentResults[0]?.summary || { total: 0, average: 0 };
  const previous = previousResults[0]?.summary || { total: 0, average: 0 };

  
  const percentageChange = previous.total > 0
    ? ((current.total - previous.total) / previous.total) * 100
    : 0;

  
  let trend: 'up' | 'down' | 'stable' = 'stable';
  if (percentageChange > 5) trend = 'up';
  else if (percentageChange < -5) trend = 'down';

  return {
    trend,
    percentageChange: Math.round(percentageChange * 10) / 10,
    currentPeriod: {
      total: current.total,
      average: current.average
    },
    previousPeriod: {
      total: previous.total,
      average: previous.average
    }
  };
}




export async function getTopItems(
  type: 'page-views' | 'events' | 'user-activity',
  limit: number = 10,
  startDate?: Date,
  endDate?: Date
): Promise<Array<{ name: string; count: number; percentage: number }>> {
  const files = await listAnalyticsFiles(type);
  const relevantFiles = filterFilesByDateRange(files, startDate, endDate);

  const itemCounts = new Map<string, number>();
  let totalCount = 0;

  
  for (const file of relevantFiles) {
    const analytics = await readAnalyticsFromMDsveX(type, file.year, file.month);
    if (!analytics) continue;

    
    if (type === 'page-views' && analytics.frontmatter.topPaths) {
      for (const p of analytics.frontmatter.topPaths) {
        itemCounts.set(p.path, (itemCounts.get(p.path) || 0) + p.count);
        totalCount += p.count;
      }
    } else if (type === 'events' && analytics.frontmatter.eventTypes) {
      for (const [eventType, count] of Object.entries(analytics.frontmatter.eventTypes)) {
        itemCounts.set(eventType, (itemCounts.get(eventType) || 0) + (count as number));
        totalCount += count as number;
      }
    } else if (type === 'user-activity' && analytics.frontmatter.activityTypes) {
      for (const [activityType, count] of Object.entries(analytics.frontmatter.activityTypes)) {
        itemCounts.set(activityType, (itemCounts.get(activityType) || 0) + (count as number));
        totalCount += count as number;
      }
    }
  }

  
  return Array.from(itemCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([name, count]) => ({
      name,
      count,
      percentage: totalCount > 0 ? Math.round((count / totalCount) * 1000) / 10 : 0
    }));
}



function filterFilesByDateRange(
  files: Array<{ year: number; month: number }>,
  startDate?: Date,
  endDate?: Date
): Array<{ year: number; month: number }> {
  return files.filter(file => {
    const fileDate = new Date(file.year, file.month - 1);
    if (startDate && fileDate < startDate) return false;
    if (endDate && fileDate > endDate) return false;
    return true;
  });
}

function groupData(
  data: Array<{ date: Date; value: number; metadata?: any }>,
  groupBy: 'day' | 'week' | 'month' | 'year'
): Array<{ date: Date; value: number; metadata?: any }> {
  const grouped = new Map<string, { date: Date; value: number; count: number }>();

  for (const item of data) {
    const key = getGroupKey(item.date, groupBy);
    const existing = grouped.get(key);

    if (existing) {
      existing.value += item.value;
      existing.count += 1;
    } else {
      grouped.set(key, {
        date: getGroupDate(item.date, groupBy),
        value: item.value,
        count: 1
      });
    }
  }

  return Array.from(grouped.values()).map(g => ({
    date: g.date,
    value: g.value,
    metadata: { averageValue: Math.round(g.value / g.count) }
  }));
}

function getGroupKey(date: Date, groupBy: string): string {
  switch (groupBy) {
    case 'day':
      return date.toISOString().split('T')[0];
    case 'week': {
      const week = getWeekNumber(date);
      return `${date.getFullYear()}-W${week}`;
    }
    case 'month':
      return `${date.getFullYear()}-${date.getMonth() + 1}`;
    case 'year':
      return date.getFullYear().toString();
    default:
      return date.toISOString();
  }
}

function getGroupDate(date: Date, groupBy: string): Date {
  switch (groupBy) {
    case 'day':
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    case 'week': {
      const week = new Date(date);
      week.setDate(week.getDate() - week.getDay());
      return week;
    }
    case 'month':
      return new Date(date.getFullYear(), date.getMonth(), 1);
    case 'year':
      return new Date(date.getFullYear(), 0, 1);
    default:
      return date;
  }
}

function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
