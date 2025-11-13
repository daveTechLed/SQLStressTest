import * as vscode from 'vscode';
import { ConnectionStorageService } from './connectionStorageService';
import { QueryResultStorageService } from './queryResultStorageService';
import { PerformanceMetricsStorageService } from './performanceMetricsStorageService';

export interface ConnectionConfig {
    id: string;
    name: string;
    server: string;
    database?: string;
    username?: string;
    password?: string;
    integratedSecurity?: boolean;
    port?: number;
}

export interface QueryResult {
    id: string;
    connectionId: string;
    query: string;
    executionTimeMs: number;
    executedAt: Date;
    success: boolean;
    errorMessage?: string;
    rowsAffected?: number;
    resultData?: string; // JSON serialized result data
}

export interface PerformanceMetrics {
    id: string;
    connectionId: string;
    timestamp: Date;
    cpuPercent: number;
    memoryBytes: number;
    activeConnections: number;
    queryExecutionTimeMs: number;
}

export interface TimeRange {
    startTime?: Date;
    endTime?: Date;
}

/**
 * Facade service that delegates to specialized storage services.
 * Maintains backward compatibility while using separated services internally.
 * Single Responsibility: Facade/coordination only.
 */
export class StorageService {
    private readonly connectionStorage: ConnectionStorageService;
    private readonly queryResultStorage: QueryResultStorageService;
    private readonly performanceMetricsStorage: PerformanceMetricsStorageService;

    constructor(context: vscode.ExtensionContext) {
        this.connectionStorage = new ConnectionStorageService(context);
        this.queryResultStorage = new QueryResultStorageService(context);
        this.performanceMetricsStorage = new PerformanceMetricsStorageService(context);
    }

    // Connection methods - delegate to ConnectionStorageService
    async saveConnections(connections: ConnectionConfig[]): Promise<void> {
        await this.connectionStorage.saveConnections(connections);
    }

    async loadConnections(): Promise<ConnectionConfig[]> {
        return await this.connectionStorage.loadConnections();
    }

    async addConnection(connection: ConnectionConfig): Promise<void> {
        await this.connectionStorage.addConnection(connection);
    }

    async removeConnection(id: string): Promise<void> {
        await this.connectionStorage.removeConnection(id);
    }

    async updateConnection(id: string, connection: ConnectionConfig): Promise<void> {
        await this.connectionStorage.updateConnection(id, connection);
    }

    async getConnection(id: string): Promise<ConnectionConfig | undefined> {
        return await this.connectionStorage.getConnection(id);
    }

    // Query result methods - delegate to QueryResultStorageService
    async saveQueryResult(result: QueryResult): Promise<void> {
        await this.queryResultStorage.saveQueryResult(result);
    }

    async loadQueryResults(connectionId: string): Promise<QueryResult[]> {
        return await this.queryResultStorage.loadQueryResults(connectionId);
    }

    // Performance metrics methods - delegate to PerformanceMetricsStorageService
    async savePerformanceMetrics(metrics: PerformanceMetrics): Promise<void> {
        await this.performanceMetricsStorage.savePerformanceMetrics(metrics);
    }

    async loadPerformanceMetrics(connectionId: string, timeRange: TimeRange): Promise<PerformanceMetrics[]> {
        return await this.performanceMetricsStorage.loadPerformanceMetrics(connectionId, timeRange);
    }
}

