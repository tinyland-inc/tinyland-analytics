import { describe, it, expect, beforeEach } from 'vitest';
import {
  configureAnalytics,
  getAnalyticsConfig,
  resetAnalyticsConfig,
} from '../src/config.js';
import type { DatabaseAdapter, AnalyticsConfig } from '../src/config.js';

describe('Analytics Configuration', () => {
  beforeEach(() => {
    resetAnalyticsConfig();
  });

  describe('configureAnalytics', () => {
    it('should set isDev flag', () => {
      configureAnalytics({ isDev: true });
      expect(getAnalyticsConfig().isDev).toBe(true);
    });

    it('should set dataDir', () => {
      configureAnalytics({ dataDir: '/custom/path' });
      expect(getAnalyticsConfig().dataDir).toBe('/custom/path');
    });

    it('should set a database adapter', () => {
      const mockDb: DatabaseAdapter = {
        query: async () => [],
      };
      configureAnalytics({ db: mockDb });
      expect(getAnalyticsConfig().db).toBe(mockDb);
    });

    it('should set a logger function', () => {
      const logger = (_level: string, _msg: string) => {};
      configureAnalytics({ logger });
      expect(getAnalyticsConfig().logger).toBe(logger);
    });

    it('should merge partial configs without overwriting existing keys', () => {
      configureAnalytics({ isDev: true });
      configureAnalytics({ dataDir: '/path' });
      const cfg = getAnalyticsConfig();
      expect(cfg.isDev).toBe(true);
      expect(cfg.dataDir).toBe('/path');
    });

    it('should allow overwriting existing keys', () => {
      configureAnalytics({ isDev: true });
      configureAnalytics({ isDev: false });
      expect(getAnalyticsConfig().isDev).toBe(false);
    });
  });

  describe('getAnalyticsConfig', () => {
    it('should return empty config by default', () => {
      const cfg = getAnalyticsConfig();
      expect(cfg.isDev).toBeUndefined();
      expect(cfg.db).toBeUndefined();
      expect(cfg.dataDir).toBeUndefined();
      expect(cfg.logger).toBeUndefined();
    });

    it('should return a readonly snapshot', () => {
      configureAnalytics({ isDev: true });
      const cfg = getAnalyticsConfig();
      expect(cfg.isDev).toBe(true);
    });
  });

  describe('resetAnalyticsConfig', () => {
    it('should clear all configuration', () => {
      configureAnalytics({
        isDev: true,
        dataDir: '/test',
        db: { query: async () => [] },
        logger: () => {},
      });
      resetAnalyticsConfig();
      const cfg = getAnalyticsConfig();
      expect(cfg.isDev).toBeUndefined();
      expect(cfg.db).toBeUndefined();
      expect(cfg.dataDir).toBeUndefined();
      expect(cfg.logger).toBeUndefined();
    });

    it('should allow reconfiguration after reset', () => {
      configureAnalytics({ isDev: true });
      resetAnalyticsConfig();
      configureAnalytics({ isDev: false });
      expect(getAnalyticsConfig().isDev).toBe(false);
    });
  });

  describe('type safety', () => {
    it('should accept a full AnalyticsConfig', () => {
      const fullConfig: AnalyticsConfig = {
        db: { query: async () => [] },
        isDev: false,
        dataDir: 'analytics-data',
        logger: (level, msg, meta) => {
          void level;
          void msg;
          void meta;
        },
      };
      configureAnalytics(fullConfig);
      const cfg = getAnalyticsConfig();
      expect(cfg.db).toBeDefined();
      expect(cfg.isDev).toBe(false);
      expect(cfg.dataDir).toBe('analytics-data');
      expect(cfg.logger).toBeDefined();
    });
  });
});
