import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StorageService, ConnectionConfig } from '../../services/storage';
import * as vscode from 'vscode';

describe('StorageService', () => {
    let storageService: StorageService;
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        mockContext = {
            workspaceState: {
                get: vi.fn(),
                update: vi.fn()
            }
        } as unknown as vscode.ExtensionContext;

        storageService = new StorageService(mockContext);
    });

    describe('saveConnections', () => {
        it('should save connections to workspace state', async () => {
            const connections: ConnectionConfig[] = [
                {
                    id: '1',
                    name: 'Test Server',
                    server: 'localhost'
                }
            ];

            await storageService.saveConnections(connections);

            expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
                'sqlStressTest.connections',
                connections
            );
        });
    });

    describe('loadConnections', () => {
        it('should load connections from workspace state', async () => {
            const connections: ConnectionConfig[] = [
                {
                    id: '1',
                    name: 'Test Server',
                    server: 'localhost'
                }
            ];

            (mockContext.workspaceState.get as any).mockReturnValue(connections);

            const result = await storageService.loadConnections();

            expect(result).toEqual(connections);
            expect(mockContext.workspaceState.get).toHaveBeenCalledWith(
                'sqlStressTest.connections',
                []
            );
        });

        it('should return empty array if no connections exist', async () => {
            (mockContext.workspaceState.get as any).mockReturnValue(undefined);

            const result = await storageService.loadConnections();

            expect(result).toEqual([]);
        });
    });

    describe('addConnection', () => {
        it('should add a new connection', async () => {
            const existingConnections: ConnectionConfig[] = [];
            const newConnection: ConnectionConfig = {
                id: '1',
                name: 'New Server',
                server: 'localhost'
            };

            (mockContext.workspaceState.get as any).mockReturnValue(existingConnections);

            await storageService.addConnection(newConnection);

            expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
                'sqlStressTest.connections',
                [newConnection]
            );
        });

        it('should update existing connection if ID already exists', async () => {
            const existingConnections: ConnectionConfig[] = [
                { id: '1', name: 'Old Name', server: 'localhost' }
            ];
            const updatedConnection: ConnectionConfig = {
                id: '1',
                name: 'New Name',
                server: 'localhost',
                database: 'master'
            };

            (mockContext.workspaceState.get as any).mockReturnValue(existingConnections);

            await storageService.addConnection(updatedConnection);

            expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
                'sqlStressTest.connections',
                [updatedConnection]
            );
            expect(mockContext.workspaceState.update).toHaveBeenCalledTimes(1);
        });

        it('should add connection to existing list without duplicates', async () => {
            const existingConnections: ConnectionConfig[] = [
                { id: '1', name: 'Server 1', server: 'localhost' }
            ];
            const newConnection: ConnectionConfig = {
                id: '2',
                name: 'Server 2',
                server: 'remote'
            };

            (mockContext.workspaceState.get as any).mockReturnValue(existingConnections);

            await storageService.addConnection(newConnection);

            expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
                'sqlStressTest.connections',
                [existingConnections[0], newConnection]
            );
        });
    });

    describe('removeConnection', () => {
        it('should remove a connection by id', async () => {
            const connections: ConnectionConfig[] = [
                { id: '1', name: 'Server 1', server: 'localhost' },
                { id: '2', name: 'Server 2', server: 'remote' }
            ];

            (mockContext.workspaceState.get as any).mockReturnValue(connections);

            await storageService.removeConnection('1');

            expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
                'sqlStressTest.connections',
                [{ id: '2', name: 'Server 2', server: 'remote' }]
            );
        });
    });

    describe('updateConnection', () => {
        it('should update an existing connection', async () => {
            const connections: ConnectionConfig[] = [
                { id: '1', name: 'Old Name', server: 'localhost' }
            ];

            (mockContext.workspaceState.get as any).mockReturnValue(connections);

            const updated: ConnectionConfig = {
                id: '1',
                name: 'New Name',
                server: 'localhost'
            };

            await storageService.updateConnection('1', updated);

            expect(mockContext.workspaceState.update).toHaveBeenCalledWith(
                'sqlStressTest.connections',
                [updated]
            );
        });

        it('should not update if connection not found', async () => {
            const connections: ConnectionConfig[] = [];

            (mockContext.workspaceState.get as any).mockReturnValue(connections);

            const updated: ConnectionConfig = {
                id: '1',
                name: 'New Name',
                server: 'localhost'
            };

            await storageService.updateConnection('1', updated);

            expect(mockContext.workspaceState.update).not.toHaveBeenCalled();
        });
    });

    describe('getConnection', () => {
        it('should return connection by id', async () => {
            const connections: ConnectionConfig[] = [
                { id: '1', name: 'Server 1', server: 'localhost' },
                { id: '2', name: 'Server 2', server: 'remote' }
            ];

            (mockContext.workspaceState.get as any).mockReturnValue(connections);

            const result = await storageService.getConnection('1');

            expect(result).toEqual(connections[0]);
        });

        it('should return undefined if connection not found', async () => {
            const connections: ConnectionConfig[] = [];

            (mockContext.workspaceState.get as any).mockReturnValue(connections);

            const result = await storageService.getConnection('999');

            expect(result).toBeUndefined();
        });
    });
});

