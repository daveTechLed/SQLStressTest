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

    describe('addConnection - persistence verification (failing tests)', () => {
        it('addConnection_ShouldPersistToStorage', async () => {
            // This test replicates the real-world scenario where:
            // 1. Connection is saved via addConnection
            // 2. Backend immediately tries to reload via LoadConnections
            // 3. Connection should be immediately readable after save
            
            const newConnection: ConnectionConfig = {
                id: 'conn_1762928362535', // From logs
                name: 'local',
                server: 'localhost',
                port: 1433,
                integratedSecurity: false,
                username: 'sa',
                password: 'password'
            };

            // Simulate storage that starts empty
            let storage: ConnectionConfig[] = [];
            (mockContext.workspaceState.get as any).mockImplementation(() => storage);
            (mockContext.workspaceState.update as any).mockImplementation((key: string, value: ConnectionConfig[]) => {
                storage = value;
            });

            // Act: Save connection
            await storageService.addConnection(newConnection);

            // Immediately try to load - this should work if persistence is synchronous
            // This test will FAIL if there's a timing issue or async persistence problem
            const connectionsAfter = await storageService.loadConnections();
            
            expect(connectionsAfter).toHaveLength(1);
            expect(connectionsAfter[0].id).toBe('conn_1762928362535');
            expect(connectionsAfter[0].name).toBe('local');
            expect(connectionsAfter[0].server).toBe('localhost');
        });

        it('loadConnections_AfterAdd_ShouldReturnAddedConnection', async () => {
            // This test verifies that after adding a connection, it's immediately available
            // This is critical for the backend reload scenario where:
            // - Frontend saves connection
            // - Frontend notifies backend
            // - Backend calls LoadConnections
            // - Backend should receive the just-saved connection
            
            const connectionToAdd: ConnectionConfig = {
                id: 'conn_test_immediate',
                name: 'Test Server',
                server: 'testserver',
                port: 1433
            };

            // Setup storage mock to track state
            let storage: ConnectionConfig[] = [];
            (mockContext.workspaceState.get as any).mockImplementation(() => [...storage]);
            (mockContext.workspaceState.update as any).mockImplementation((key: string, value: ConnectionConfig[]) => {
                storage = [...value];
            });

            // Verify storage is empty initially
            const beforeAdd = await storageService.loadConnections();
            expect(beforeAdd).toHaveLength(0);

            // Add connection
            await storageService.addConnection(connectionToAdd);

            // Immediately load - should return the connection
            // This test will FAIL if:
            // 1. Storage update is not synchronous
            // 2. There's a race condition between save and load
            // 3. Storage mock doesn't properly simulate persistence
            const afterAdd = await storageService.loadConnections();
            
            expect(afterAdd).toHaveLength(1);
            expect(afterAdd[0].id).toBe('conn_test_immediate');
            expect(afterAdd[0].name).toBe('Test Server');
            expect(afterAdd[0].server).toBe('testserver');
        });
    });
});

