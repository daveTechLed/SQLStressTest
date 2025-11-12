import * as vscode from 'vscode';

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

const STORAGE_KEY_CONNECTIONS = 'sqlStressTest.connections';
const STORAGE_KEY_QUERY_RESULTS = 'sqlStressTest.queryResults';
const STORAGE_KEY_PERFORMANCE_METRICS = 'sqlStressTest.performanceMetrics';

export class StorageService {
    constructor(private context: vscode.ExtensionContext) {}

    async saveConnections(connections: ConnectionConfig[]): Promise<void> {
        await this.context.workspaceState.update(STORAGE_KEY_CONNECTIONS, connections);
    }

    async loadConnections(): Promise<ConnectionConfig[]> {
        const connections = this.context.workspaceState.get<ConnectionConfig[]>(STORAGE_KEY_CONNECTIONS, []);
        return connections;
    }

    async addConnection(connection: ConnectionConfig): Promise<void> {
        const connections = await this.loadConnections();
        // Check if connection already exists (by ID)
        const existingIndex = connections.findIndex(c => c.id === connection.id);
        if (existingIndex >= 0) {
            // Update existing connection
            connections[existingIndex] = connection;
        } else {
            // Add new connection
            connections.push(connection);
        }
        await this.saveConnections(connections);
    }

    async removeConnection(id: string): Promise<void> {
        const connections = await this.loadConnections();
        const filtered = connections.filter(c => c.id !== id);
        await this.saveConnections(filtered);
    }

    async updateConnection(id: string, connection: ConnectionConfig): Promise<void> {
        const connections = await this.loadConnections();
        const index = connections.findIndex(c => c.id === id);
        if (index >= 0) {
            connections[index] = connection;
            await this.saveConnections(connections);
        }
    }

    async getConnection(id: string): Promise<ConnectionConfig | undefined> {
        const connections = await this.loadConnections();
        return connections.find(c => c.id === id);
    }

    async saveQueryResult(result: QueryResult): Promise<void> {
        const key = `${STORAGE_KEY_QUERY_RESULTS}.${result.connectionId}`;
        const results = await this.loadQueryResults(result.connectionId);
        results.push(result);
        // Keep only last 1000 results per connection to prevent storage bloat
        const trimmed = results.slice(-1000);
        await this.context.workspaceState.update(key, trimmed);
    }

    async loadQueryResults(connectionId: string): Promise<QueryResult[]> {
        const key = `${STORAGE_KEY_QUERY_RESULTS}.${connectionId}`;
        const results = this.context.workspaceState.get<QueryResult[]>(key, []);
        // Convert date strings back to Date objects
        return results.map(r => ({
            ...r,
            executedAt: typeof r.executedAt === 'string' ? new Date(r.executedAt) : r.executedAt
        }));
    }

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

