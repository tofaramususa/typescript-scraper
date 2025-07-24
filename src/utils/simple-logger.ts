import * as fs from 'fs';
import * as path from 'path';

/**
 * Simple logging levels
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

/**
 * Simple logger with file output
 */
export class SimpleLogger {
  private logLevel: LogLevel;
  private logFile?: string;
  private metrics = {
    errors: 0,
    warnings: 0,
    requests: 0,
    startTime: Date.now()
  };

  constructor(logLevel: LogLevel = LogLevel.INFO, logDir?: string) {
    this.logLevel = logLevel;
    
    if (logDir) {
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      const timestamp = new Date().toISOString().split('T')[0];
      this.logFile = path.join(logDir, `scraper-${timestamp}.log`);
    }
  }

  private log(level: LogLevel, message: string, data?: any): void {
    if (level < this.logLevel) return;

    const timestamp = new Date().toISOString();
    const levelName = LogLevel[level];
    const logEntry = `[${timestamp}] ${levelName}: ${message}`;
    
    // Console output with colors
    switch (level) {
      case LogLevel.DEBUG:
        console.debug(`🔍 ${logEntry}`, data || '');
        break;
      case LogLevel.INFO:
        console.log(`ℹ️  ${logEntry}`, data || '');
        break;
      case LogLevel.WARN:
        console.warn(`⚠️  ${logEntry}`, data || '');
        this.metrics.warnings++;
        break;
      case LogLevel.ERROR:
        console.error(`❌ ${logEntry}`, data || '');
        this.metrics.errors++;
        break;
    }

    // File output
    if (this.logFile) {
      try {
        const fileEntry = data 
          ? `${logEntry} ${JSON.stringify(data)}\n`
          : `${logEntry}\n`;
        fs.appendFileSync(this.logFile, fileEntry);
      } catch (error) {
        console.error('Failed to write to log file:', error);
      }
    }
  }

  debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data);
  }

  info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, message, data);
  }

  /**
   * Log operation metrics
   */
  logMetric(operation: string, duration: number, success: boolean): void {
    this.metrics.requests++;
    const status = success ? 'SUCCESS' : 'FAILED';
    this.info(`${operation} ${status} (${duration}ms)`);
  }

  /**
   * Get current metrics
   */
  getMetrics(): typeof this.metrics & { uptime: number } {
    return {
      ...this.metrics,
      uptime: Date.now() - this.metrics.startTime
    };
  }

  /**
   * Log system metrics
   */
  logSystemMetrics(): void {
    const metrics = this.getMetrics();
    const uptimeHours = Math.round(metrics.uptime / 1000 / 60 / 60 * 100) / 100;
    
    this.info('System Metrics', {
      uptime: `${uptimeHours}h`,
      totalRequests: metrics.requests,
      errors: metrics.errors,
      warnings: metrics.warnings,
      errorRate: metrics.requests > 0 ? Math.round((metrics.errors / metrics.requests) * 100) : 0
    });
  }
}

// Global logger instance
export const logger = new SimpleLogger(
  process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO,
  './logs'
);

/**
 * Performance monitoring wrapper
 */
export function withMetrics<T>(
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  return fn()
    .then(result => {
      logger.logMetric(operation, Date.now() - start, true);
      return result;
    })
    .catch(error => {
      logger.logMetric(operation, Date.now() - start, false);
      logger.error(`${operation} failed`, { error: error.message });
      throw error;
    });
}