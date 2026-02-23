import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  configureAnalytics,
  resetAnalyticsConfig,
} from '../src/config.js';
import type { DatabaseAdapter } from '../src/config.js';


const __mockStore = new Map<string, string>();
const __mockDirStore = new Set<string>();


vi.mock('fs', () => {
  return {
    promises: {
      writeFile: vi.fn(async (filePath: string, content: string) => {
        __mockStore.set(filePath, content);
      }),
      readFile: vi.fn(async (filePath: string) => {
        const content = __mockStore.get(filePath);
        if (!content) {
          const err: any = new Error(`ENOENT: no such file - ${filePath}`);
          err.code = 'ENOENT';
          throw err;
        }
        return content;
      }),
      mkdir: vi.fn(async (dirPath: string) => {
        __mockDirStore.add(dirPath);
      }),
      readdir: vi.fn(async (dirPath: string) => {
        
        const entries: string[] = [];
        for (const key of __mockStore.keys()) {
          if (key.startsWith(dirPath + '/')) {
            const rest = key.slice(dirPath.length + 1);
            const nextSegment = rest.split('/')[0];
            if (nextSegment && !entries.includes(nextSegment)) {
              entries.push(nextSegment);
            }
          }
        }
        if (entries.length === 0) {
          const err: any = new Error(`ENOENT: no such directory - ${dirPath}`);
          err.code = 'ENOENT';
          throw err;
        }
        return entries;
      }),
    },
    
    default: {
      promises: {
        writeFile: vi.fn(),
        readFile: vi.fn(),
        mkdir: vi.fn(),
        readdir: vi.fn(),
      },
    },
  };
});


import { promises as fs } from 'fs';
import {
  writeAnalyticsToMDsveX,
  readAnalyticsFromMDsveX,
  listAnalyticsFiles,
} from '../src/mdsvex-writer.js';
import type { AnalyticsData } from '../src/mdsvex-writer.js';
import {
  queryAnalytics,
  getTrendingAnalytics,
  getTopItems,
} from '../src/query-service.js';
import {
  trackPageView,
  trackEvent,
  trackUserActivity,
  getBufferStats,
  flushAnalyticsBuffer,
  startAnalyticsWriter,
  stopAnalyticsWriter,
  clearAnalyticsBuffer,
} from '../src/real-time-writer.js';
import {
  convertPageViewsToMDsveX,
  convertEventAnalyticsToMDsveX,
  convertUserActivityToMDsveX,
  convertAllAnalytics,
} from '../src/converter.js';




function makeData(
  dayOfMonth: number,
  value: number,
  meta?: Record<string, any>
): AnalyticsData {
  return {
    timestamp: new Date(2026, 0, dayOfMonth, 12, 0, 0),
    value,
    metadata: meta,
  };
}

function createMockDb(rows: any[] = []): DatabaseAdapter {
  return {
    query: vi.fn(async () => rows),
  };
}




describe('MDsveX Writer', () => {
  beforeEach(() => {
    resetAnalyticsConfig();
    __mockStore.clear();
    __mockDirStore.clear();
    vi.clearAllMocks();
  });

  it('should write an MDsveX file with frontmatter', async () => {
    const data: AnalyticsData[] = [
      makeData(1, 10),
      makeData(2, 20),
    ];

    const filePath = await writeAnalyticsToMDsveX('page-views', new Date(2026, 0), data);
    expect(filePath).toContain('01.mdx');
    expect(fs.writeFile).toHaveBeenCalledOnce();

    const writtenContent = (fs.writeFile as any).mock.calls[0][1] as string;
    expect(writtenContent).toContain('type: "page-views"');
    expect(writtenContent).toContain('year: 2026');
    expect(writtenContent).toContain('month: 1');
    expect(writtenContent).toContain('totalCount: 30');
  });

  it('should calculate correct statistics', async () => {
    const data: AnalyticsData[] = [
      makeData(5, 100),
      makeData(5, 50),
      makeData(10, 200),
    ];

    await writeAnalyticsToMDsveX('events', new Date(2026, 0), data);
    const writtenContent = (fs.writeFile as any).mock.calls[0][1] as string;
    expect(writtenContent).toContain('totalCount: 350');
    expect(writtenContent).toContain('uniqueCount: 2'); 
  });

  it('should merge additional frontmatter', async () => {
    const data: AnalyticsData[] = [makeData(1, 5)];
    await writeAnalyticsToMDsveX('user-activity', new Date(2026, 1), data, {
      uniqueUsers: 42,
    });

    const writtenContent = (fs.writeFile as any).mock.calls[0][1] as string;
    expect(writtenContent).toContain('uniqueUsers: 42');
  });

  it('should use custom dataDir when configured', async () => {
    configureAnalytics({ dataDir: 'custom/analytics' });
    const data: AnalyticsData[] = [makeData(1, 1)];
    const filePath = await writeAnalyticsToMDsveX('page-views', new Date(2026, 0), data);
    expect(filePath).toContain('custom/analytics');
  });

  it('should create directory before writing', async () => {
    const data: AnalyticsData[] = [makeData(1, 1)];
    await writeAnalyticsToMDsveX('page-views', new Date(2026, 0), data);
    expect(fs.mkdir).toHaveBeenCalled();
  });

  it('should format daily breakdown in content', async () => {
    const data: AnalyticsData[] = [
      makeData(15, 77),
    ];
    await writeAnalyticsToMDsveX('page-views', new Date(2026, 0), data);
    const writtenContent = (fs.writeFile as any).mock.calls[0][1] as string;
    expect(writtenContent).toContain('## Daily Breakdown');
    expect(writtenContent).toContain('**Total**: 77');
  });

  it('should handle analytics title mapping', async () => {
    const data: AnalyticsData[] = [makeData(1, 1)];

    await writeAnalyticsToMDsveX('page-views', new Date(2026, 0), data);
    let content = (fs.writeFile as any).mock.calls[0][1] as string;
    expect(content).toContain('# Page Views');

    vi.clearAllMocks();
    await writeAnalyticsToMDsveX('events', new Date(2026, 0), data);
    content = (fs.writeFile as any).mock.calls[0][1] as string;
    expect(content).toContain('# Event Analytics');

    vi.clearAllMocks();
    await writeAnalyticsToMDsveX('user-activity', new Date(2026, 0), data);
    content = (fs.writeFile as any).mock.calls[0][1] as string;
    expect(content).toContain('# User Activity');
  });
});

describe('readAnalyticsFromMDsveX', () => {
  beforeEach(() => {
    resetAnalyticsConfig();
    __mockStore.clear();
    __mockDirStore.clear();
    vi.clearAllMocks();
  });

  it('should return null for non-existent file', async () => {
    const result = await readAnalyticsFromMDsveX('page-views', 2026, 1);
    expect(result).toBeNull();
  });

  it('should parse frontmatter from written file', async () => {
    
    const data: AnalyticsData[] = [makeData(1, 42)];
    await writeAnalyticsToMDsveX('page-views', new Date(2026, 0), data);

    
    const written = (fs.writeFile as any).mock.calls[0][1] as string;
    const writtenPath = (fs.writeFile as any).mock.calls[0][0] as string;
    (fs.readFile as any).mockResolvedValueOnce(written);

    const result = await readAnalyticsFromMDsveX('page-views', 2026, 1);
    expect(result).not.toBeNull();
    expect(result!.frontmatter.type).toBe('page-views');
    expect(result!.frontmatter.year).toBe(2026);
    expect(result!.frontmatter.totalCount).toBe(42);
  });

  it('should return null when frontmatter is missing', async () => {
    (fs.readFile as any).mockResolvedValueOnce('No frontmatter here');
    const result = await readAnalyticsFromMDsveX('events', 2026, 3);
    expect(result).toBeNull();
  });
});

describe('listAnalyticsFiles', () => {
  beforeEach(() => {
    resetAnalyticsConfig();
    __mockStore.clear();
    __mockDirStore.clear();
    vi.clearAllMocks();
  });

  it('should return empty array when no files exist', async () => {
    const files = await listAnalyticsFiles('page-views');
    expect(files).toEqual([]);
  });

  it('should return sorted files when directories exist', async () => {
    
    (fs.readdir as any)
      .mockResolvedValueOnce(['2025', '2026'])  
      .mockResolvedValueOnce(['12.mdx'])         
      .mockResolvedValueOnce(['01.mdx']);         

    const files = await listAnalyticsFiles('page-views');
    expect(files).toHaveLength(2);
    
    expect(files[0].year).toBe(2026);
    expect(files[0].month).toBe(1);
    expect(files[1].year).toBe(2025);
    expect(files[1].month).toBe(12);
  });
});




describe('Query Service', () => {
  beforeEach(() => {
    resetAnalyticsConfig();
    __mockStore.clear();
    __mockDirStore.clear();
    vi.clearAllMocks();
  });

  it('should return empty results when no files match', async () => {
    const results = await queryAnalytics({ type: 'page-views' });
    expect(results).toEqual([]);
  });

  it('should query all types when type is not specified', async () => {
    
    const results = await queryAnalytics({});
    expect(results).toEqual([]);
  });

  it('should return trending data with stable trend for zero data', async () => {
    const trend = await getTrendingAnalytics('page-views', 30);
    expect(trend.trend).toBe('stable');
    expect(trend.percentageChange).toBe(0);
    expect(trend.currentPeriod.total).toBe(0);
    expect(trend.previousPeriod.total).toBe(0);
  });

  it('should return empty top items when no files exist', async () => {
    const items = await getTopItems('events', 5);
    expect(items).toEqual([]);
  });
});




describe('Real-Time Writer', () => {
  beforeEach(() => {
    resetAnalyticsConfig();
    clearAnalyticsBuffer();
    __mockStore.clear();
    __mockDirStore.clear();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    stopAnalyticsWriter();
    vi.useRealTimers();
  });

  it('should track page views into the buffer', async () => {
    await trackPageView('/home', 'sess-1');
    const stats = getBufferStats();
    expect(stats['page-views']).toBe(1);
    expect(stats['events']).toBe(0);
    expect(stats['user-activity']).toBe(0);
  });

  it('should track events into the buffer', async () => {
    await trackEvent('evt-1', 'meetup', 15);
    const stats = getBufferStats();
    expect(stats['events']).toBe(1);
  });

  it('should track user activity into the buffer', async () => {
    await trackUserActivity('user-1', 'login');
    const stats = getBufferStats();
    expect(stats['user-activity']).toBe(1);
  });

  it('should accumulate multiple events', async () => {
    await trackPageView('/a');
    await trackPageView('/b');
    await trackPageView('/c');
    expect(getBufferStats()['page-views']).toBe(3);
  });

  it('should clear buffer via clearAnalyticsBuffer', async () => {
    await trackPageView('/x');
    await trackEvent('e1', 'workshop');
    await trackUserActivity('u1', 'logout');
    clearAnalyticsBuffer();
    const stats = getBufferStats();
    expect(stats['page-views']).toBe(0);
    expect(stats['events']).toBe(0);
    expect(stats['user-activity']).toBe(0);
  });

  it('should flush buffer without errors when buffer is empty', async () => {
    await expect(flushAnalyticsBuffer()).resolves.toBeUndefined();
  });

  it('should start and stop the analytics writer', () => {
    startAnalyticsWriter();
    
    startAnalyticsWriter();
    stopAnalyticsWriter();
    
    stopAnalyticsWriter();
  });

  it('should use shorter interval in dev mode', () => {
    configureAnalytics({ isDev: true });
    startAnalyticsWriter();
    
    stopAnalyticsWriter();
  });

  it('should auto-flush page views in dev mode after threshold', async () => {
    configureAnalytics({ isDev: true });
    
    for (let i = 0; i < 10; i++) {
      await trackPageView(`/page-${i}`);
    }
    
    expect(fs.writeFile).toHaveBeenCalled();
    expect(getBufferStats()['page-views']).toBe(0);
  });

  it('should auto-flush events in dev mode after threshold', async () => {
    configureAnalytics({ isDev: true });
    for (let i = 0; i < 5; i++) {
      await trackEvent(`evt-${i}`, 'type-a', 1);
    }
    expect(fs.writeFile).toHaveBeenCalled();
    expect(getBufferStats()['events']).toBe(0);
  });

  it('should auto-flush user activity in dev mode after threshold', async () => {
    configureAnalytics({ isDev: true });
    for (let i = 0; i < 10; i++) {
      await trackUserActivity(`user-${i}`, 'action');
    }
    expect(fs.writeFile).toHaveBeenCalled();
    expect(getBufferStats()['user-activity']).toBe(0);
  });
});




describe('Converter', () => {
  beforeEach(() => {
    resetAnalyticsConfig();
    __mockStore.clear();
    __mockDirStore.clear();
    vi.clearAllMocks();
  });

  it('should throw when no db adapter is configured', async () => {
    await expect(
      convertPageViewsToMDsveX(new Date(2026, 0, 1), new Date(2026, 0, 31))
    ).rejects.toThrow('No DatabaseAdapter configured');
  });

  it('should convert page views from DB to MDsveX', async () => {
    const mockDb = createMockDb([
      {
        id: '1',
        path: '/home',
        timestamp: new Date(2026, 0, 15, 10, 0, 0),
        user_agent: 'Mozilla/5.0',
        referrer: 'https://google.com',
        session_id: 'sess-1',
      },
      {
        id: '2',
        path: '/about',
        timestamp: new Date(2026, 0, 16, 14, 30, 0),
        user_agent: 'Mozilla/5.0',
        referrer: null,
        session_id: 'sess-2',
      },
    ]);

    configureAnalytics({ db: mockDb });
    const results = await convertPageViewsToMDsveX(
      new Date(2026, 0, 1),
      new Date(2026, 0, 31)
    );

    expect(mockDb.query).toHaveBeenCalledOnce();
    expect(results).toHaveLength(1); 
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should convert event analytics from DB to MDsveX', async () => {
    const mockDb = createMockDb([
      {
        event_id: 'e1',
        event_type: 'meetup',
        timestamp: new Date(2026, 1, 10),
        participants: 25,
        metadata: { location: 'NYC' },
      },
    ]);

    configureAnalytics({ db: mockDb });
    const results = await convertEventAnalyticsToMDsveX(
      new Date(2026, 1, 1),
      new Date(2026, 1, 28)
    );

    expect(results).toHaveLength(1);
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should convert user activity from DB to MDsveX', async () => {
    const mockDb = createMockDb([
      {
        user_id: 'u1',
        activity_type: 'login',
        timestamp: new Date(2026, 2, 5),
        metadata: {},
      },
      {
        user_id: 'u2',
        activity_type: 'post',
        timestamp: new Date(2026, 2, 6),
        metadata: {},
      },
    ]);

    configureAnalytics({ db: mockDb });
    const results = await convertUserActivityToMDsveX(
      new Date(2026, 2, 1),
      new Date(2026, 2, 31)
    );

    expect(results).toHaveLength(1);
    expect(fs.writeFile).toHaveBeenCalled();
  });

  it('should handle empty DB results', async () => {
    const mockDb = createMockDb([]);
    configureAnalytics({ db: mockDb });

    const results = await convertPageViewsToMDsveX(
      new Date(2026, 0, 1),
      new Date(2026, 0, 31)
    );
    expect(results).toEqual([]);
  });

  it('should convert all analytics types', async () => {
    const mockDb = createMockDb([]);
    configureAnalytics({ db: mockDb });

    const results = await convertAllAnalytics(
      new Date(2026, 0, 1),
      new Date(2026, 0, 31)
    );

    expect(results.pageViews).toEqual([]);
    expect(results.events).toEqual([]);
    expect(results.userActivity).toEqual([]);
    expect(mockDb.query).toHaveBeenCalledTimes(3);
  });

  it('should pass correct SQL parameters to the DB adapter', async () => {
    const start = new Date(2026, 5, 1);
    const end = new Date(2026, 5, 30);
    const mockDb = createMockDb([]);
    configureAnalytics({ db: mockDb });

    await convertPageViewsToMDsveX(start, end);

    expect(mockDb.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM page_views'),
      [start, end]
    );
  });

  it('should use logger when configured', async () => {
    const logMessages: Array<{ level: string; msg: string }> = [];
    const mockDb: DatabaseAdapter = {
      query: vi.fn(async () => {
        throw new Error('DB connection failed');
      }),
    };

    configureAnalytics({
      db: mockDb,
      logger: (level, msg) => logMessages.push({ level, msg }),
    });

    await expect(
      convertPageViewsToMDsveX(new Date(2026, 0, 1), new Date(2026, 0, 31))
    ).rejects.toThrow('DB connection failed');

    expect(logMessages).toHaveLength(1);
    expect(logMessages[0].level).toBe('error');
    expect(logMessages[0].msg).toContain('Failed to convert page views');
  });

  it('should handle convertAllAnalytics with partial failures', async () => {
    let callCount = 0;
    const mockDb: DatabaseAdapter = {
      query: vi.fn(async () => {
        callCount++;
        if (callCount === 2) throw new Error('Event query failed');
        return [];
      }),
    };

    configureAnalytics({ db: mockDb });
    const results = await convertAllAnalytics(
      new Date(2026, 0, 1),
      new Date(2026, 0, 31)
    );

    
    expect(results.pageViews).toEqual([]);
    expect(results.events).toEqual([]);
    expect(results.userActivity).toEqual([]);
  });

  it('should group data across multiple months', async () => {
    const mockDb = createMockDb([
      {
        id: '1',
        path: '/jan-page',
        timestamp: new Date(2026, 0, 15),
        user_agent: 'test',
        referrer: null,
        session_id: 's1',
      },
      {
        id: '2',
        path: '/feb-page',
        timestamp: new Date(2026, 1, 10),
        user_agent: 'test',
        referrer: null,
        session_id: 's2',
      },
    ]);

    configureAnalytics({ db: mockDb });
    const results = await convertPageViewsToMDsveX(
      new Date(2026, 0, 1),
      new Date(2026, 1, 28)
    );

    
    expect(results).toHaveLength(2);
    expect(fs.writeFile).toHaveBeenCalledTimes(2);
  });
});
