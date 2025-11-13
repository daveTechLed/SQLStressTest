import * as vscode from 'vscode';
import { HttpClient } from '../../services/httpClient';
import { ILogger } from '../../services/logger';

/**
 * Handles stress test execution operations.
 * Single Responsibility: Stress test execution only.
 */
export class StressTestHandler {
    private isStressTestRunning: boolean = false;

    constructor(
        private httpClient: HttpClient,
        private logger: ILogger
    ) {}

    async executeStressTest(
        connectionId: string, 
        query: string,
        parallelExecutions: number,
        totalExecutions: number,
        database?: string
    ): Promise<{
        success: boolean;
        testId?: string;
        error?: string;
        message?: string;
    }> {
        this.isStressTestRunning = true;

        this.logger.log('Executing stress test', { 
            connectionId, 
            queryLength: query.length,
            parallelExecutions,
            totalExecutions
        });

        // Notify that stress test is starting (this will be handled by extension.ts to start PerformanceGraph and HistoricalMetricsView)
        vscode.commands.executeCommand('sqlStressTest.showPerformanceGraph', connectionId);
        vscode.commands.executeCommand('sqlStressTest.showHistoricalMetrics', connectionId);

        try {
            const response = await this.httpClient.executeStressTest({
                connectionId,
                query,
                parallelExecutions,
                totalExecutions,
                database
            });
            
            this.isStressTestRunning = false;
            this.logger.log('Stress test execution completed', { 
                success: response.success, 
                testId: response.testId,
                message: response.message,
                error: response.error
            });
            
            return response;
        } catch (error) {
            this.isStressTestRunning = false;
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            this.logger.error('Stress test execution error', error);
            throw new Error(errorMessage);
        }
    }

    stopStressTest(): void {
        if (!this.isStressTestRunning) {
            this.logger.log('Stop stress test called but no test is running');
            return;
        }

        this.logger.log('Stopping stress test');
        
        // Call stopStressTest on HistoricalMetricsView and PerformanceGraph
        vscode.commands.executeCommand('sqlStressTest.stopHistoricalMetrics');
        vscode.commands.executeCommand('sqlStressTest.stopPerformanceGraph');

        this.isStressTestRunning = false;
    }

    isRunning(): boolean {
        return this.isStressTestRunning;
    }
}

