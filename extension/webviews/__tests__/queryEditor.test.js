import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('queryEditor.js', () => {
    let vscodeApi;
    let postMessageSpy;
    let mockEditor;
    let scriptContent;

    beforeEach(async () => {
        // Mock acquireVsCodeApi
        postMessageSpy = vi.fn();
        vscodeApi = {
            postMessage: postMessageSpy
        };
        global.acquireVsCodeApi = vi.fn(() => vscodeApi);

        // Mock require and monaco editor
        mockEditor = {
            getValue: vi.fn(() => 'SELECT * FROM sys.tables;'),
            setValue: vi.fn(),
            dispose: vi.fn()
        };

        // Set up monaco before require is called
        global.monaco = {
            editor: {
                create: vi.fn(() => mockEditor)
            }
        };
        
        const requireFn = vi.fn((deps, callback) => {
            // Execute callback immediately to initialize editor
            if (callback) {
                // Monaco editor initialization callback
                callback();
            }
        });
        requireFn.config = vi.fn(() => {});
        global.require = requireFn;

        // Mock alert
        global.alert = vi.fn();

        // Set up DOM
        document.body.innerHTML = `
            <select id="connectionSelect">
                <option value="">Select connection...</option>
            </select>
            <select id="databaseSelect" disabled>
                <option value="">Select database...</option>
            </select>
            <button id="executeBtn">Execute</button>
            <button id="stressTestBtn">Run Stress Test</button>
            <button id="stopStressTestBtn" style="display: none;">Stop Run</button>
            <input type="number" id="parallelExecutions" value="1">
            <input type="number" id="totalExecutions" value="10">
            <div id="stressTestStatus"></div>
            <div id="editor"></div>
        `;

        // Ensure require.config is available before script execution
        if (!global.require.config) {
            global.require.config = vi.fn(() => {});
        }
        
        // Load and execute the script
        const scriptPath = join(__dirname, '../queryEditor.js');
        scriptContent = readFileSync(scriptPath, 'utf8');
        
        // Remove the last line that calls postMessage on load
        const scriptWithoutLoad = scriptContent.replace(/\/\/ Request connections on load[\s\S]*$/, '');
        
        // Execute script - require.config should be available
        // Modify script to use window.editor and window.vscode so event handlers can access them
        let scriptWithGlobalEditor = scriptWithoutLoad;
        
        // Don't modify vscode declaration - it should work as-is in closures
        // The const vscode will be captured by event handler closures
        
        // Replace 'let editor' declaration with window.editor initialization
        scriptWithGlobalEditor = scriptWithGlobalEditor.replace(
            /let\s+editor\s*;/,
            'window.editor = undefined;'
        );
        
        // Replace editor assignment in require callback to set window.editor
        scriptWithGlobalEditor = scriptWithGlobalEditor.replace(
            /editor\s*=\s*monaco\.editor\.create/,
            'window.editor = monaco.editor.create'
        );
        
        // Replace ALL editor.getValue() calls in event handlers to use window.editor
        scriptWithGlobalEditor = scriptWithGlobalEditor.replace(
            /const query = editor\.getValue\(\)/g,
            'const query = (window.editor && window.editor.getValue) ? window.editor.getValue() : ""'
        );
        
        // Don't replace vscode.postMessage - vscode should be accessible in closure
        // The const vscode declaration should make it available to event handlers
        
        // Execute script using Function constructor
        // This ensures all variables are in the same scope for event listener closures
        const executeScript = new Function(scriptWithGlobalEditor);
        executeScript();
        
        // Ensure editor is set - require callback should have executed synchronously
        if (!window.editor) {
            window.editor = mockEditor;
        }
        
        // Ensure vscode is accessible - it should be set by the script
        // But also ensure window.vscode is available for event handlers
        if (!window.vscode) {
            window.vscode = vscodeApi;
        }
        
        // Verify DOM elements exist and event listeners should be attached
        const connectionSelect = document.getElementById('connectionSelect');
        const executeBtn = document.getElementById('executeBtn');
        expect(connectionSelect).toBeTruthy();
        expect(executeBtn).toBeTruthy();
        
        // Verify vscode is accessible
        expect(window.vscode).toBeTruthy();
        expect(window.vscode.postMessage).toBeTruthy();
        
        // Give a small delay for any async operations
        await new Promise(resolve => setTimeout(resolve, 10));
    });

    describe('Connection selection', () => {
        it('should disable database select and show loading when connection is selected', async () => {
            const connectionSelect = document.getElementById('connectionSelect');
            const databaseSelect = document.getElementById('databaseSelect');
            
            // Ensure elements exist and event listeners are attached
            expect(connectionSelect).toBeTruthy();
            expect(databaseSelect).toBeTruthy();
            
            // Clear any previous state
            databaseSelect.innerHTML = '<option value="">Select database...</option>';
            databaseSelect.disabled = false;
            
            // Set value and trigger change event
            // Use input event first to ensure value is set, then change event
            connectionSelect.value = 'conn1';
            connectionSelect.dispatchEvent(new Event('input', { bubbles: true }));
            connectionSelect.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

            // Check results
            expect(databaseSelect.disabled).toBe(true);
            expect(databaseSelect.innerHTML).toContain('Loading databases...');
            expect(postMessageSpy).toHaveBeenCalledWith({
                command: 'getDatabases',
                connectionId: 'conn1'
            });
        });

        it('should reset database select when connection is cleared', async () => {
            const connectionSelect = document.getElementById('connectionSelect');
            const databaseSelect = document.getElementById('databaseSelect');
            
            connectionSelect.value = '';
            connectionSelect.dispatchEvent(new Event('change'));

            expect(databaseSelect.disabled).toBe(true);
            expect(databaseSelect.innerHTML).toContain('Select database...');
        });
    });

    describe('Execute query', () => {
        it('should show alert if no connection is selected', async () => {
            const executeBtn = document.getElementById('executeBtn');
            const connectionSelect = document.getElementById('connectionSelect');
            
            connectionSelect.value = '';
            executeBtn.click();

            expect(alert).toHaveBeenCalledWith('Please select a connection');
            expect(postMessageSpy).not.toHaveBeenCalledWith(
                expect.objectContaining({ command: 'executeQuery' })
            );
        });

        it('should show alert if query is empty', async () => {
            const executeBtn = document.getElementById('executeBtn');
            const connectionSelect = document.getElementById('connectionSelect');
            
            connectionSelect.value = 'conn1';
            // Ensure editor is accessible
            if (window.editor) {
                window.editor.getValue = vi.fn(() => '');
            } else {
                mockEditor.getValue.mockReturnValue('');
            }
            executeBtn.click();

            expect(alert).toHaveBeenCalledWith('Please enter a query');
        });

        it('should send executeQuery message with correct data', async () => {
            const executeBtn = document.getElementById('executeBtn');
            const connectionSelect = document.getElementById('connectionSelect');
            const databaseSelect = document.getElementById('databaseSelect');
            
            connectionSelect.value = 'conn1';
            databaseSelect.value = 'db1';
            // Ensure editor is accessible
            if (window.editor) {
                window.editor.getValue = vi.fn(() => 'SELECT * FROM table1');
            } else {
                mockEditor.getValue.mockReturnValue('SELECT * FROM table1');
            }
            executeBtn.click();

            expect(postMessageSpy).toHaveBeenCalledWith({
                command: 'executeQuery',
                connectionId: 'conn1',
                query: 'SELECT * FROM table1',
                database: 'db1'
            });
        });

        it('should send executeQuery without database if not selected', async () => {
            const executeBtn = document.getElementById('executeBtn');
            const connectionSelect = document.getElementById('connectionSelect');
            const databaseSelect = document.getElementById('databaseSelect');
            
            connectionSelect.value = 'conn1';
            databaseSelect.value = '';
            // Ensure editor is accessible
            if (window.editor) {
                window.editor.getValue = vi.fn(() => 'SELECT * FROM table1');
            } else {
                mockEditor.getValue.mockReturnValue('SELECT * FROM table1');
            }
            executeBtn.click();

            expect(postMessageSpy).toHaveBeenCalledWith({
                command: 'executeQuery',
                connectionId: 'conn1',
                query: 'SELECT * FROM table1',
                database: undefined
            });
        });
    });

    describe('Stress test', () => {
        it('should validate parallel executions range', async () => {
            const stressTestBtn = document.getElementById('stressTestBtn');
            const connectionSelect = document.getElementById('connectionSelect');
            const parallelExecutionsInput = document.getElementById('parallelExecutions');
            
            connectionSelect.value = 'conn1';
            parallelExecutionsInput.value = '0';
            stressTestBtn.click();

            expect(alert).toHaveBeenCalledWith('Parallel executions must be between 1 and 1000');
        });

        it('should validate total executions range', async () => {
            const stressTestBtn = document.getElementById('stressTestBtn');
            const connectionSelect = document.getElementById('connectionSelect');
            const totalExecutionsInput = document.getElementById('totalExecutions');
            
            connectionSelect.value = 'conn1';
            totalExecutionsInput.value = '0';
            stressTestBtn.click();

            expect(alert).toHaveBeenCalledWith('Total executions must be between 1 and 100000');
        });

        it('should send executeStressTest message with correct data', async () => {
            const stressTestBtn = document.getElementById('stressTestBtn');
            const connectionSelect = document.getElementById('connectionSelect');
            const databaseSelect = document.getElementById('databaseSelect');
            const parallelExecutionsInput = document.getElementById('parallelExecutions');
            const totalExecutionsInput = document.getElementById('totalExecutions');
            const stressTestStatus = document.getElementById('stressTestStatus');
            const stopStressTestBtn = document.getElementById('stopStressTestBtn');
            
            connectionSelect.value = 'conn1';
            databaseSelect.value = 'db1';
            parallelExecutionsInput.value = '5';
            totalExecutionsInput.value = '100';
            // Ensure editor is accessible
            if (window.editor) {
                window.editor.getValue = vi.fn(() => 'SELECT * FROM table1');
            } else {
                mockEditor.getValue.mockReturnValue('SELECT * FROM table1');
            }
            stressTestBtn.click();

            expect(stressTestStatus.textContent).toBe('Starting stress test...');
            expect(stressTestBtn.disabled).toBe(true);
            expect(stopStressTestBtn.style.display).toBe('inline-block');
            expect(postMessageSpy).toHaveBeenCalledWith({
                command: 'executeStressTest',
                connectionId: 'conn1',
                query: 'SELECT * FROM table1',
                parallelExecutions: 5,
                totalExecutions: 100,
                database: 'db1'
            });
        });

        it('should handle stop stress test', () => {
            const stopStressTestBtn = document.getElementById('stopStressTestBtn');
            const stressTestStatus = document.getElementById('stressTestStatus');
            
            stopStressTestBtn.click();

            expect(stopStressTestBtn.disabled).toBe(true);
            expect(stressTestStatus.textContent).toBe('Stopping stress test...');
            expect(postMessageSpy).toHaveBeenCalledWith({
                command: 'stopStressTest'
            });
        });
    });

    describe('Message handling', () => {
        it('should update connections list', () => {
            const connectionSelect = document.getElementById('connectionSelect');
            const connections = [
                { id: 'conn1', name: 'Server1', server: 'server1' },
                { id: 'conn2', name: 'Server2', server: 'server2' }
            ];

            const event = new MessageEvent('message', {
                data: {
                    command: 'connections',
                    data: connections,
                    selectedConnectionId: 'conn1'
                }
            });
            window.dispatchEvent(event);

            expect(connectionSelect.options.length).toBe(3); // Default + 2 connections
            expect(connectionSelect.options[1].value).toBe('conn1');
            expect(connectionSelect.options[1].textContent).toBe('Server1 (server1)');
            expect(connectionSelect.options[1].selected).toBe(true);
        });

        it('should update databases list', () => {
            const databaseSelect = document.getElementById('databaseSelect');
            const databases = ['db1', 'db2', 'db3'];

            const event = new MessageEvent('message', {
                data: {
                    command: 'databases',
                    data: databases,
                    error: null
                }
            });
            window.dispatchEvent(event);

            expect(databaseSelect.options.length).toBe(4); // Default + 3 databases
            expect(databaseSelect.disabled).toBe(false);
        });

        it('should show error when database fetch fails', () => {
            const databaseSelect = document.getElementById('databaseSelect');

            const event = new MessageEvent('message', {
                data: {
                    command: 'databases',
                    data: [],
                    error: 'Connection failed'
                }
            });
            window.dispatchEvent(event);

            expect(databaseSelect.options.length).toBe(2); // Default + error option
            expect(databaseSelect.options[1].textContent).toContain('Error: Connection failed');
            expect(databaseSelect.disabled).toBe(true);
        });

        it('should handle stressTestStarted message', () => {
            const stressTestBtn = document.getElementById('stressTestBtn');
            const stopStressTestBtn = document.getElementById('stopStressTestBtn');

            const event = new MessageEvent('message', {
                data: {
                    command: 'stressTestStarted'
                }
            });
            window.dispatchEvent(event);

            expect(stressTestBtn.disabled).toBe(true);
            expect(stopStressTestBtn.style.display).toBe('inline-block');
            expect(stopStressTestBtn.disabled).toBe(false);
        });

        it('should handle stressTestStopped message', () => {
            const stressTestBtn = document.getElementById('stressTestBtn');
            const stopStressTestBtn = document.getElementById('stopStressTestBtn');
            const stressTestStatus = document.getElementById('stressTestStatus');

            const event = new MessageEvent('message', {
                data: {
                    command: 'stressTestStopped'
                }
            });
            window.dispatchEvent(event);

            expect(stressTestStatus.textContent).toBe('Stress test stopped');
            expect(stressTestBtn.disabled).toBe(false);
            expect(stopStressTestBtn.style.display).toBe('none');
        });

        it('should handle successful stressTestResult', () => {
            const stressTestBtn = document.getElementById('stressTestBtn');
            const stopStressTestBtn = document.getElementById('stopStressTestBtn');
            const stressTestStatus = document.getElementById('stressTestStatus');

            const event = new MessageEvent('message', {
                data: {
                    command: 'stressTestResult',
                    data: {
                        success: true,
                        message: 'Test completed successfully'
                    }
                }
            });
            window.dispatchEvent(event);

            expect(stressTestStatus.textContent).toBe('Stress test completed: Test completed successfully');
            expect(stressTestStatus.style.color).toBe('var(--vscode-textLink-foreground)');
            expect(stressTestBtn.disabled).toBe(false);
            expect(stopStressTestBtn.style.display).toBe('none');
        });

        it('should handle failed stressTestResult', () => {
            const stressTestBtn = document.getElementById('stressTestBtn');
            const stopStressTestBtn = document.getElementById('stopStressTestBtn');
            const stressTestStatus = document.getElementById('stressTestStatus');

            const event = new MessageEvent('message', {
                data: {
                    command: 'stressTestResult',
                    data: {
                        success: false,
                        error: 'Test failed'
                    }
                }
            });
            window.dispatchEvent(event);

            expect(stressTestStatus.textContent).toBe('Stress test failed: Test failed');
            expect(stressTestStatus.style.color).toBe('var(--vscode-errorForeground)');
            expect(stressTestBtn.disabled).toBe(false);
            expect(stopStressTestBtn.style.display).toBe('none');
        });
    });
});

