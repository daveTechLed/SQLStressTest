import * as vscode from 'vscode';
import { PerformanceMetrics, TimeRange } from './storage';

const STORAGE_KEY_PERFORMANCE_METRICS = 'sqlStressTest.performanceMetrics';

/**
 * Service responsible for managing performance metrics storage.
 * Single Responsibility: Performance metrics storage operations only.
 */
export class PerformanceMetricsStorageService {
    constructor(private context: vscode.ExtensionContext) {}

    async savePerformanceMetrics(metrics: PerformanceMetrics): Promise<void> {
        const key = `${STORAGE_KEY_PERFORMANCE_METRICS}.${metrics.connectionId}`;
        const allMetrics = await this.loadPerformanceMetrics(metrics.connectionId, {});
        allMetrics.push(metrics);
        // Keep only last 10000 metrics per connection to prevent storage bloat
        const trimmed = allMetrics.slice(-10000);
        await this.context.workspaceState.update(key, trimmed);
    }

    async loadPerformanceMetrics(connectionId: string, timeRange: TimeRange): Promise<PerformanceMetrics[]> {
        const key = `${STORAGE_KEY_PERFORMANCE_METRICS}.${connectionId}`;
        let metrics = this.context.workspaceState.get<PerformanceMetrics[]>(key, []);
        
        // Convert date strings back to Date objects
        metrics = metrics.map(m => ({
            ...m,
            timestamp: typeof m.timestamp === 'string' ? new Date(m.timestamp) : m.timestamp
        }));

        // Filter by time range if provided
        if (timeRange.startTime) {
            metrics = metrics.filter(m => m.timestamp >= timeRange.startTime!);
        }
        if (timeRange.endTime) {
            metrics = metrics.filter(m => m.timestamp <= timeRange.endTime!);
        }

        return metrics;
    }
}

