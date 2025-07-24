import * as fs from 'fs';
import * as path from 'path';
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
})(LogLevel || (LogLevel = {}));
export class SimpleLogger {
    logLevel;
    logFile;
    metrics = {
        errors: 0,
        warnings: 0,
        requests: 0,
        startTime: Date.now()
    };
    constructor(logLevel = LogLevel.INFO, logDir) {
        this.logLevel = logLevel;
        if (logDir) {
            if (!fs.existsSync(logDir)) {
                fs.mkdirSync(logDir, { recursive: true });
            }
            const timestamp = new Date().toISOString().split('T')[0];
            this.logFile = path.join(logDir, `scraper-${timestamp}.log`);
        }
    }
    log(level, message, data) {
        if (level < this.logLevel)
            return;
        const timestamp = new Date().toISOString();
        const levelName = LogLevel[level];
        const logEntry = `[${timestamp}] ${levelName}: ${message}`;
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
        if (this.logFile) {
            try {
                const fileEntry = data
                    ? `${logEntry} ${JSON.stringify(data)}\n`
                    : `${logEntry}\n`;
                fs.appendFileSync(this.logFile, fileEntry);
            }
            catch (error) {
                console.error('Failed to write to log file:', error);
            }
        }
    }
    debug(message, data) {
        this.log(LogLevel.DEBUG, message, data);
    }
    info(message, data) {
        this.log(LogLevel.INFO, message, data);
    }
    warn(message, data) {
        this.log(LogLevel.WARN, message, data);
    }
    error(message, data) {
        this.log(LogLevel.ERROR, message, data);
    }
    logMetric(operation, duration, success) {
        this.metrics.requests++;
        const status = success ? 'SUCCESS' : 'FAILED';
        this.info(`${operation} ${status} (${duration}ms)`);
    }
    getMetrics() {
        return {
            ...this.metrics,
            uptime: Date.now() - this.metrics.startTime
        };
    }
    logSystemMetrics() {
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
export const logger = new SimpleLogger(process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO, './logs');
export function withMetrics(operation, fn) {
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
//# sourceMappingURL=simple-logger.js.map