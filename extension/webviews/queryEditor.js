const vscode = acquireVsCodeApi();
let editor;

require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
require(['vs/editor/editor.main'], function() {
    editor = monaco.editor.create(document.getElementById('editor'), {
        value: 'SELECT * FROM sys.tables;',
        language: 'sql',
        theme: 'vs-dark',
        automaticLayout: true
    });
});

const connectionSelect = document.getElementById('connectionSelect');
const databaseSelect = document.getElementById('databaseSelect');
const executeBtn = document.getElementById('executeBtn');
const stressTestBtn = document.getElementById('stressTestBtn');
const stopStressTestBtn = document.getElementById('stopStressTestBtn');
const parallelExecutionsInput = document.getElementById('parallelExecutions');
const totalExecutionsInput = document.getElementById('totalExecutions');
const stressTestStatus = document.getElementById('stressTestStatus');

// Handle connection change - fetch databases
connectionSelect.addEventListener('change', () => {
    const connectionId = connectionSelect.value;
    if (connectionId) {
        databaseSelect.disabled = true;
        databaseSelect.innerHTML = '<option value="">Loading databases...</option>';
        vscode.postMessage({
            command: 'getDatabases',
            connectionId: connectionId
        });
    } else {
        databaseSelect.disabled = true;
        databaseSelect.innerHTML = '<option value="">Select database...</option>';
    }
});

executeBtn.addEventListener('click', () => {
    const connectionId = connectionSelect.value;
    const database = databaseSelect.value || undefined;
    const query = editor.getValue();
    
    if (!connectionId) {
        alert('Please select a connection');
        return;
    }
    
    if (!query.trim()) {
        alert('Please enter a query');
        return;
    }

    vscode.postMessage({
        command: 'executeQuery',
        connectionId: connectionId,
        query: query,
        database: database
    });
});

stressTestBtn.addEventListener('click', () => {
    const connectionId = connectionSelect.value;
    const database = databaseSelect.value || undefined;
    const query = editor.getValue();
    const parallelExecutions = parseInt(parallelExecutionsInput.value) || 1;
    const totalExecutions = parseInt(totalExecutionsInput.value) || 10;
    
    if (!connectionId) {
        alert('Please select a connection');
        return;
    }
    
    if (!query.trim()) {
        alert('Please enter a query');
        return;
    }

    if (parallelExecutions < 1 || parallelExecutions > 1000) {
        alert('Parallel executions must be between 1 and 1000');
        return;
    }

    if (totalExecutions < 1 || totalExecutions > 100000) {
        alert('Total executions must be between 1 and 100000');
        return;
    }

    stressTestStatus.textContent = 'Starting stress test...';
    stressTestBtn.disabled = true;
    stopStressTestBtn.style.display = 'inline-block';
    stopStressTestBtn.disabled = false;

    vscode.postMessage({
        command: 'executeStressTest',
        connectionId: connectionId,
        query: query,
        parallelExecutions: parallelExecutions,
        totalExecutions: totalExecutions,
        database: database
    });
});

stopStressTestBtn.addEventListener('click', () => {
    stopStressTestBtn.disabled = true;
    stressTestStatus.textContent = 'Stopping stress test...';
    
    vscode.postMessage({
        command: 'stopStressTest'
    });
});

window.addEventListener('message', event => {
    const message = event.data;
    switch (message.command) {
        case 'connections':
            updateConnections(message.data, message.selectedConnectionId);
            // If a connection is pre-selected, fetch its databases
            if (message.selectedConnectionId) {
                const selectedOption = connectionSelect.querySelector(`option[value="${message.selectedConnectionId}"]`);
                if (selectedOption) {
                    connectionSelect.value = message.selectedConnectionId;
                    connectionSelect.dispatchEvent(new Event('change'));
                }
            }
            break;
        case 'databases':
            updateDatabases(message.data, message.error);
            break;
        case 'queryResult':
            // Query results are no longer displayed
            break;
        case 'stressTestStarted':
            stressTestBtn.disabled = true;
            stopStressTestBtn.style.display = 'inline-block';
            stopStressTestBtn.disabled = false;
            break;
        case 'stressTestStopped':
            stressTestStatus.textContent = 'Stress test stopped';
            stressTestStatus.style.color = 'var(--vscode-descriptionForeground)';
            stressTestBtn.disabled = false;
            stopStressTestBtn.style.display = 'none';
            break;
        case 'stressTestResult':
            if (message.data.success) {
                stressTestStatus.textContent = 'Stress test completed: ' + (message.data.message || 'Success');
                stressTestStatus.style.color = 'var(--vscode-textLink-foreground)';
            } else {
                stressTestStatus.textContent = 'Stress test failed: ' + (message.data.error || 'Unknown error');
                stressTestStatus.style.color = 'var(--vscode-errorForeground)';
            }
            stressTestBtn.disabled = false;
            stopStressTestBtn.style.display = 'none';
            break;
    }
});

function updateConnections(connections, selectedConnectionId) {
    connectionSelect.innerHTML = '<option value="">Select connection...</option>';
    connections.forEach(conn => {
        const option = document.createElement('option');
        option.value = conn.id;
        option.textContent = conn.name + ' (' + conn.server + ')';
        if (selectedConnectionId && conn.id === selectedConnectionId) {
            option.selected = true;
        }
        connectionSelect.appendChild(option);
    });
}

function updateDatabases(databases, error) {
    databaseSelect.innerHTML = '<option value="">Select database...</option>';
    
    if (error) {
        const errorOption = document.createElement('option');
        errorOption.value = '';
        errorOption.textContent = 'Error: ' + error;
        errorOption.disabled = true;
        databaseSelect.appendChild(errorOption);
        databaseSelect.disabled = true;
        return;
    }
    
    if (databases && databases.length > 0) {
        databases.forEach(db => {
            const option = document.createElement('option');
            option.value = db;
            option.textContent = db;
            databaseSelect.appendChild(option);
        });
        databaseSelect.disabled = false;
    } else {
        const noDbOption = document.createElement('option');
        noDbOption.value = '';
        noDbOption.textContent = 'No databases found';
        noDbOption.disabled = true;
        databaseSelect.appendChild(noDbOption);
        databaseSelect.disabled = true;
    }
}

// Request connections on load
vscode.postMessage({ command: 'getConnections' });

