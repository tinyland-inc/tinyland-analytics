import { promises as fs } from 'fs';
import path from 'path';
import { getAnalyticsConfig } from './config.js';

// Default base path; overridable via `configureAnalytics({ dataDir })`.
const DEFAULT_ANALYTICS_BASE_PATH = 'src/content/analytics';

function getBasePath(): string {
  return getAnalyticsConfig().dataDir ?? DEFAULT_ANALYTICS_BASE_PATH;
}

function isDev(): boolean {
  return getAnalyticsConfig().isDev ?? false;
}

export interface AnalyticsData {
  timestamp: Date;
  value: number;
  metadata?: Record<string, any>;
}

export interface AnalyticsFrontmatter {
  type: 'page-views' | 'events' | 'user-activity';
  year: number;
  month: number;
  totalCount?: number;
  uniqueCount?: number;
  averageDaily?: number;
  peakDay?: string;
  peakHour?: number;
  lastUpdated: string;
  [key: string]: any;
}

/**
 * Write analytics data to an MDsveX file.
 */
export async function writeAnalyticsToMDsveX(
  type: 'page-views' | 'events' | 'user-activity',
  date: Date,
  data: AnalyticsData[],
  additionalFrontmatter?: Partial<AnalyticsFrontmatter>
) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const monthPadded = month.toString().padStart(2, '0');

  // Create file path
  const filePath = path.join(
    process.cwd(),
    getBasePath(),
    type,
    year.toString(),
    `${monthPadded}.mdx`
  );

  // Ensure directory exists
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  // Calculate aggregate statistics
  const totalCount = data.reduce((sum, item) => sum + item.value, 0);
  const uniqueDays = new Set(data.map(item =>
    item.timestamp.toISOString().split('T')[0]
  )).size;
  const averageDaily = uniqueDays > 0 ? Math.round(totalCount / uniqueDays) : 0;

  // Find peak day
  const dailyTotals = data.reduce((acc, item) => {
    const day = item.timestamp.toISOString().split('T')[0];
    acc[day] = (acc[day] || 0) + item.value;
    return acc;
  }, {} as Record<string, number>);

  const peakDay = Object.entries(dailyTotals)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || '';

  // Find peak hour
  const hourlyTotals = data.reduce((acc, item) => {
    const hour = item.timestamp.getHours();
    acc[hour] = (acc[hour] || 0) + item.value;
    return acc;
  }, {} as Record<number, number>);

  const peakHour = Object.entries(hourlyTotals)
    .sort(([, a], [, b]) => b - a)[0]?.[0] || '0';

  // Create frontmatter
  const frontmatter: AnalyticsFrontmatter = {
    type,
    year,
    month,
    totalCount,
    uniqueCount: uniqueDays,
    averageDaily,
    peakDay,
    peakHour: parseInt(peakHour),
    lastUpdated: new Date().toISOString(),
    ...additionalFrontmatter
  };

  // Format data for content
  const formattedData = formatAnalyticsData(data, type);

  // Create MDsveX content
  const content = `---
${Object.entries(frontmatter)
  .map(([key, value]) => `${key}: ${typeof value === 'string' ? `"${value}"` : value}`)
  .join('\n')}
---

# ${getAnalyticsTitle(type)} - ${getMonthName(month)} ${year}

## Summary

- **Total ${getMetricName(type)}**: {frontmatter.totalCount.toLocaleString()}
- **Daily Average**: {frontmatter.averageDaily.toLocaleString()}
- **Peak Day**: {new Date(frontmatter.peakDay).toLocaleDateString()}
- **Peak Hour**: {frontmatter.peakHour}:00 - {frontmatter.peakHour + 1}:00

## Daily Breakdown

${formattedData}

<script>
  // Access analytics data from frontmatter
  export let data;

  // Chart component can be added here
  // import { AnalyticsChart } from '$lib/components/analytics';
</script>

<style>
  /* Custom styles for analytics display */
</style>
`;

  // Write to file
  await fs.writeFile(filePath, content, 'utf-8');

  if (isDev()) {
    if (process.env.NODE_ENV === 'development') console.log(`Analytics written to: ${filePath}`);
  }

  return filePath;
}

/**
 * Read analytics from an MDsveX file.
 */
export async function readAnalyticsFromMDsveX(
  type: 'page-views' | 'events' | 'user-activity',
  year: number,
  month: number
): Promise<{ frontmatter: AnalyticsFrontmatter; content: string } | null> {
  const monthPadded = month.toString().padStart(2, '0');
  const filePath = path.join(
    process.cwd(),
    getBasePath(),
    type,
    year.toString(),
    `${monthPadded}.mdx`
  );

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Extract frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return null;

    const frontmatterText = frontmatterMatch[1];
    const frontmatter: any = {};

    frontmatterText.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split(':');
      if (key && valueParts.length) {
        const value = valueParts.join(':').trim();
        // Parse value type
        if (value.startsWith('"') && value.endsWith('"')) {
          frontmatter[key.trim()] = value.slice(1, -1);
        } else if (!isNaN(Number(value))) {
          frontmatter[key.trim()] = Number(value);
        } else if (value === 'true' || value === 'false') {
          frontmatter[key.trim()] = value === 'true';
        } else {
          frontmatter[key.trim()] = value;
        }
      }
    });

    return {
      frontmatter: frontmatter as AnalyticsFrontmatter,
      content: content.replace(/^---\n[\s\S]*?\n---\n/, '')
    };
  } catch (error) {
    if ((error as any).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * List available analytics files.
 */
export async function listAnalyticsFiles(
  type?: 'page-views' | 'events' | 'user-activity'
): Promise<Array<{ type: string; year: number; month: number; path: string }>> {
  const types = type ? [type] : ['page-views', 'events', 'user-activity'];
  const files: Array<{ type: string; year: number; month: number; path: string }> = [];

  for (const t of types) {
    const typePath = path.join(process.cwd(), getBasePath(), t);

    try {
      const years = await fs.readdir(typePath);

      for (const year of years) {
        if (!/^\d{4}$/.test(year)) continue;

        const yearPath = path.join(typePath, year);
        const months = await fs.readdir(yearPath);

        for (const monthFile of months) {
          if (!/^\d{2}\.mdx$/.test(monthFile)) continue;

          const month = parseInt(monthFile.replace('.mdx', ''));
          files.push({
            type: t,
            year: parseInt(year),
            month,
            path: path.join(yearPath, monthFile)
          });
        }
      }
    } catch (error) {
      // Directory doesn't exist yet
      if ((error as any).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  return files.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
}

// Helper functions
function formatAnalyticsData(data: AnalyticsData[], _type: string): string {
  // Group by day
  const byDay = data.reduce((acc, item) => {
    const day = item.timestamp.toISOString().split('T')[0];
    if (!acc[day]) acc[day] = [];
    acc[day].push(item);
    return acc;
  }, {} as Record<string, AnalyticsData[]>);

  // Format each day
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, items]) => {
      const total = items.reduce((sum, item) => sum + item.value, 0);
      const date = new Date(day);

      return `### ${date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}

- **Total**: ${total.toLocaleString()}
- **Data Points**: ${items.length}
${items.length > 0 ? `- **Average**: ${Math.round(total / items.length).toLocaleString()}` : ''}
`;
    })
    .join('\n');
}

function getAnalyticsTitle(type: string): string {
  switch (type) {
    case 'page-views': return 'Page Views';
    case 'events': return 'Event Analytics';
    case 'user-activity': return 'User Activity';
    default: return 'Analytics';
  }
}

function getMetricName(type: string): string {
  switch (type) {
    case 'page-views': return 'views';
    case 'events': return 'events';
    case 'user-activity': return 'activities';
    default: return 'items';
  }
}

function getMonthName(month: number): string {
  return new Date(2000, month - 1).toLocaleDateString('en-US', { month: 'long' });
}
