import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HttpClient, QueryRequest, QueryResponse } from '../../services/httpClient';
import axios from 'axios';
import * as vscode from 'vscode';

vi.mock('axios');
vi.mock('vscode', () => ({
    workspace: {
        getConfiguration: vi.fn(() => ({
            get: vi.fn(() => 'http://localhost:5000')
        }))
    }
}));

describe('HttpClient', () => {
    let client: HttpClient;
    let mockAxios: any;

    beforeEach(() => {
        mockAxios = {
            create: vi.fn(() => ({
                post: vi.fn()
            }))
        };

        (axios.create as any) = mockAxios.create;
        client = new HttpClient();
    });

    describe('executeQuery', () => {
        it('should execute query successfully', async () => {
            const request: QueryRequest = {
                connectionId: '1',
                query: 'SELECT * FROM users'
            };

            const mockResponse: QueryResponse = {
                success: true,
                columns: ['id', 'name'],
                rows: [[1, 'John']],
                rowCount: 1,
                executionTimeMs: 100
            };

            const mockPost = vi.fn().mockResolvedValue({ data: mockResponse });
            (client as any).client = { post: mockPost };

            const result = await client.executeQuery(request);

            expect(result).toEqual(mockResponse);
            expect(mockPost).toHaveBeenCalledWith('/api/sql/execute', request);
        });

        it('should handle errors from server', async () => {
            const request: QueryRequest = {
                connectionId: '1',
                query: 'SELECT * FROM users'
            };

            const mockErrorResponse: QueryResponse = {
                success: false,
                error: 'Connection failed'
            };

            const mockPost = vi.fn().mockRejectedValue({
                response: { data: mockErrorResponse }
            });
            (client as any).client = { post: mockPost };

            const result = await client.executeQuery(request);

            expect(result).toEqual(mockErrorResponse);
        });

        it('should throw error on network failure', async () => {
            const request: QueryRequest = {
                connectionId: '1',
                query: 'SELECT * FROM users'
            };

            const mockPost = vi.fn().mockRejectedValue({
                message: 'Network error'
            });
            (client as any).client = { post: mockPost };

            await expect(client.executeQuery(request)).rejects.toThrow('Failed to execute query: Network error');
        });
    });

    describe('testConnection', () => {
        it('should test connection successfully', async () => {
            const connectionConfig = {
                server: 'localhost',
                database: 'test'
            };

            const mockResponse = {
                success: true
            };

            const mockPost = vi.fn().mockResolvedValue({ data: mockResponse });
            (client as any).client = { post: mockPost };

            const result = await client.testConnection(connectionConfig);

            expect(result).toEqual(mockResponse);
            expect(mockPost).toHaveBeenCalledWith('/api/sql/test', connectionConfig);
        });

        it('should handle connection test failure', async () => {
            const connectionConfig = {
                server: 'localhost',
                database: 'test'
            };

            const mockErrorResponse = {
                success: false,
                error: 'Connection timeout'
            };

            const mockPost = vi.fn().mockRejectedValue({
                response: { data: mockErrorResponse }
            });
            (client as any).client = { post: mockPost };

            const result = await client.testConnection(connectionConfig);

            expect(result).toEqual(mockErrorResponse);
        });
    });
});

