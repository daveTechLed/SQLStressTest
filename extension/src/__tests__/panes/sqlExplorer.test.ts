import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SqlServerExplorer } from '../../panes/sqlExplorer';
import * as vscode from 'vscode';
import { WebSocketClient } from '../../services/websocketClient';
import { StorageService } from '../../services/storage';

vi.mock('../../services/storage');
vi.mock('../../services/httpClient');
vi.mock('vscode');

describe('SqlServerExplorer', () => {
    let explorer: SqlServerExplorer;
    let mockContext: vscode.ExtensionContext;
    let mockWebSocketClient: any;
    let mockStorageService: any;

    beforeEach(() => {
        mockContext = {
            workspaceState: {
                get: vi.fn(),
                update: vi.fn()
            }
        } as unknown as vscode.ExtensionContext;

        mockWebSocketClient = {
            connect: vi.fn(),
            disconnect: vi.fn(),
            isConnected: vi.fn().mockReturnValue(false)
        };

        mockStorageService = {
            loadConnections: vi.fn().mockResolvedValue([]),
            addConnection: vi.fn().mockResolvedValue(undefined),
            removeConnection: vi.fn().mockResolvedValue(undefined),
            getConnection: vi.fn().mockResolvedValue(undefined)
        };

        (StorageService as any).mockImplementation(() => mockStorageService);

        explorer = new SqlServerExplorer(mockContext, mockWebSocketClient);
    });

    describe('getChildren', () => {
        it('should return empty array when no connections', async () => {
            mockStorageService.loadConnections.mockResolvedValue([]);

            const children = await explorer.getChildren();

            expect(children).toEqual([]);
        });

        it('should return server items for connections', async () => {
            const connections = [
                {
                    id: '1',
                    name: 'Server 1',
                    server: 'localhost'
                },
                {
                    id: '2',
                    name: 'Server 2',
                    server: 'remote'
                }
            ];

            mockStorageService.loadConnections.mockResolvedValue(connections);

            const children = await explorer.getChildren();

            expect(children).toHaveLength(2);
            expect(children[0].label).toBe('Server 1');
            expect(children[1].label).toBe('Server 2');
        });
    });

    describe('addServer', () => {
        it('should not add server if name is cancelled', async () => {
            (vscode.window.showInputBox as any).mockResolvedValue(undefined);

            await explorer.addServer();

            expect(mockStorageService.addConnection).not.toHaveBeenCalled();
        });

        it('should not add server if server address is cancelled', async () => {
            (vscode.window.showInputBox as any)
                .mockResolvedValueOnce('Test Server')
                .mockResolvedValueOnce(undefined);

            await explorer.addServer();

            expect(mockStorageService.addConnection).not.toHaveBeenCalled();
        });
    });

    describe('removeServer', () => {
        it('should remove server when confirmed', async () => {
            const item = {
                label: 'Test Server',
                connectionId: '1'
            } as any;

            (vscode.window.showWarningMessage as any).mockResolvedValue('Yes');
            mockStorageService.removeConnection.mockResolvedValue(undefined);

            await explorer.removeServer(item);

            expect(mockStorageService.removeConnection).toHaveBeenCalledWith('1');
        });

        it('should not remove server when cancelled', async () => {
            const item = {
                label: 'Test Server',
                connectionId: '1'
            } as any;

            (vscode.window.showWarningMessage as any).mockResolvedValue('No');

            await explorer.removeServer(item);

            expect(mockStorageService.removeConnection).not.toHaveBeenCalled();
        });
    });

    describe('testConnection', () => {
        it('should show error if connection not found', async () => {
            const item = {
                connectionId: '1'
            } as any;

            mockStorageService.getConnection.mockResolvedValue(undefined);

            await explorer.testConnection(item);

            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });
    });
});

