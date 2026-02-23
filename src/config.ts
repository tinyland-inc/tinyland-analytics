










export interface DatabaseAdapter {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
}





export type LoggerFn = (level: string, msg: string, meta?: Record<string, unknown>) => void;

export interface AnalyticsConfig {
  
  db?: DatabaseAdapter;
  
  isDev?: boolean;
  
  dataDir?: string;
  
  logger?: LoggerFn;
}

let config: AnalyticsConfig = {};


export function configureAnalytics(c: AnalyticsConfig): void {
  config = { ...config, ...c };
}


export function getAnalyticsConfig(): Readonly<AnalyticsConfig> {
  return config;
}


export function resetAnalyticsConfig(): void {
  config = {};
}
