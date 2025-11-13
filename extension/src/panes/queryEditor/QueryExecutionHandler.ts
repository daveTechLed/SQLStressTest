import { HttpClient, QueryRequest, QueryResponse } from '../../services/httpClient';
import { ILogger } from '../../services/logger';

/**
 * Handles query execution operations.
 * Single Responsibility: Query execution only.
 */
export class QueryExecutionHandler {
    constructor(
        private httpClient: HttpClient,
        private logger: ILogger
    ) {}

    async executeQuery(connectionId: string, query: string, database?: string): Promise<void> {
        this.logger.log('Executing query', { connectionId, queryLength: query.length, database });
        const request: QueryRequest = {
            connectionId,
            query,
            database
        };

        try {
            const response = await this.httpClient.executeQuery(request);
            this.logger.log('Query execution completed', { 
                success: response.success, 
                rowCount: response.rowCount,
                executionTimeMs: response.executionTimeMs 
            });
            // Query results are no longer displayed
            this.logger.log('Query executed successfully (results not displayed)', { 
                rowCount: response.rowCount,
                executionTimeMs: response.executionTimeMs 
            });
        } catch (error) {
            this.logger.error('Query execution failed (error not displayed)', error);
        }
    }
}

