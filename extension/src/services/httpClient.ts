import axios, { AxiosInstance, AxiosError } from 'axios';
import * as vscode from 'vscode';
import { ILogger, Logger } from './logger';

export interface QueryRequest {
    connectionId: string;
    query: string;
}

export interface QueryResponse {
    success: boolean;
    columns?: string[];
    rows?: any[][];
    rowCount?: number;
    executionTimeMs?: number;
    error?: string;
}

export class HttpClient {
    private client: AxiosInstance;
    private readonly baseUrl: string;
    private logger: ILogger;

    constructor(baseUrl?: string, logger?: ILogger) {
        const config = vscode.workspace.getConfiguration('sqlStressTest');
        this.baseUrl = baseUrl || config.get<string>('backendUrl', 'http://localhost:5000');
        this.logger = logger || new Logger('SQL Stress Test - HTTP Client');
        
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        this.logger.log('HttpClient initialized', { baseUrl: this.baseUrl });
    }

    async executeQuery(request: QueryRequest): Promise<QueryResponse> {
        this.logger.log('Executing query', { connectionId: request.connectionId, queryLength: request.query.length });
        try {
            const response = await this.client.post<QueryResponse>('/api/sql/execute', request);
            this.logger.log('Query executed successfully', { 
                success: response.data.success, 
                rowCount: response.data.rowCount,
                executionTimeMs: response.data.executionTimeMs 
            });
            return response.data;
        } catch (error) {
            const axiosError = error as AxiosError<QueryResponse>;
            this.logger.error('Query execution failed', {
                message: axiosError.message,
                status: axiosError.response?.status,
                statusText: axiosError.response?.statusText,
                data: axiosError.response?.data
            });
            if (axiosError.response?.data) {
                return axiosError.response.data;
            }
            throw new Error(`Failed to execute query: ${axiosError.message}`);
        }
    }

    async executeStressTest(request: {
        connectionId: string;
        query: string;
        parallelExecutions: number;
        totalExecutions: number;
    }): Promise<{
        success: boolean;
        testId?: string;
        error?: string;
        message?: string;
    }> {
        this.logger.log('Executing stress test', { 
            connectionId: request.connectionId, 
            parallelExecutions: request.parallelExecutions,
            totalExecutions: request.totalExecutions,
            queryLength: request.query.length 
        });
        try {
            const response = await this.client.post<{
                success: boolean;
                testId?: string;
                error?: string;
                message?: string;
            }>('/api/sql/stress-test', request);
            this.logger.log('Stress test executed', { 
                success: response.data.success, 
                testId: response.data.testId,
                message: response.data.message,
                error: response.data.error
            });
            return response.data;
        } catch (error) {
            const axiosError = error as any;
            this.logger.error('Stress test execution failed', {
                message: axiosError.message,
                status: axiosError.response?.status,
                statusText: axiosError.response?.statusText,
                data: axiosError.response?.data
            });
            if (axiosError.response?.data) {
                return axiosError.response.data;
            }
            throw new Error(`Failed to execute stress test: ${axiosError.message}`);
        }
    }

    async testConnection(connectionConfig: any): Promise<{
        success: boolean;
        error?: string;
        serverVersion?: string;
        authenticatedUser?: string;
        databases?: string[];
        serverName?: string;
    }> {
        this.logger.log('Testing connection', { server: connectionConfig.server, name: connectionConfig.name });
        try {
            const response = await this.client.post<{
                success: boolean;
                error?: string;
                serverVersion?: string;
                authenticatedUser?: string;
                databases?: string[];
                serverName?: string;
            }>('/api/sql/test', connectionConfig);
            if (response.data.success) {
                this.logger.log('Connection test successful', {
                    server: connectionConfig.server,
                    serverVersion: response.data.serverVersion,
                    authenticatedUser: response.data.authenticatedUser,
                    databaseCount: response.data.databases?.length
                });
            } else {
                this.logger.warn('Connection test failed', { server: connectionConfig.server, error: response.data.error });
            }
            return response.data;
        } catch (error) {
            const axiosError = error as AxiosError<{
                success: boolean;
                error?: string;
                serverVersion?: string;
                authenticatedUser?: string;
                databases?: string[];
                serverName?: string;
            }>;
            this.logger.error('Connection test error', {
                message: axiosError.message,
                status: axiosError.response?.status,
                statusText: axiosError.response?.statusText
            });
            if (axiosError.response?.data) {
                return axiosError.response.data;
            }
            return { success: false, error: axiosError.message };
        }
    }
}

