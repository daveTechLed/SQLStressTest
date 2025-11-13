import * as vscode from 'vscode';
import { QueryResult } from './storage';

const STORAGE_KEY_QUERY_RESULTS = 'sqlStressTest.queryResults';

/**
 * Service responsible for managing query result storage.
 * Single Responsibility: Query result storage operations only.
 */
export class QueryResultStorageService {
    constructor(private context: vscode.ExtensionContext) {}

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
}

