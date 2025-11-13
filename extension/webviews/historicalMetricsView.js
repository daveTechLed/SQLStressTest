const vscode = acquireVsCodeApi();
const container = document.getElementById('metricsContainer');

function formatValue(value, unit) {
    if (unit === 'bytes') {
        if (value >= 1024 * 1024) {
            return (value / (1024 * 1024)).toFixed(2) + ' MB';
        } else if (value >= 1024) {
            return (value / 1024).toFixed(2) + ' KB';
        }
        return value + ' bytes';
    }
    if (unit === 'ms') {
        return value.toFixed(2) + ' ms';
    }
    return Math.round(value).toLocaleString();
}

function createCard(card) {
    const cardDiv = document.createElement('div');
    const isCombined = card.executionTime || card.dataSize;
    cardDiv.className = isCombined ? 'metric-card combined' : 'metric-card';
    
    // Handle combined card (Execution Time & Data Size)
    if (isCombined) {
        let html = `<div class="metric-label">${card.label}</div>`;
        html += '<div class="combined-metrics">';
        
        // Execution Time section
        if (card.executionTime) {
            const trendSymbol = card.executionTime.trend === 'up' ? '↑' : card.executionTime.trend === 'down' ? '↓' : '→';
            const trendClass = card.executionTime.trend;
            html += '<div class="combined-metric-section">';
            html += '<div class="metric-label">Execution Time</div>';
            html += `<div class="combined-metric-value">${formatValue(card.executionTime.current, card.executionTime.unit)}<span class="trend ${trendClass}">${trendSymbol}</span></div>`;
            if (card.executionTime.previous !== undefined) {
                const change = ((card.executionTime.current - card.executionTime.previous) / card.executionTime.previous * 100).toFixed(1);
                html += `<div class="metric-stats">Previous: ${formatValue(card.executionTime.previous, card.executionTime.unit)} (${change > 0 ? '+' : ''}${change}%)</div>`;
            }
            if (card.executionTime.min !== undefined && card.executionTime.max !== undefined) {
                html += `<div class="metric-stats">Range: ${formatValue(card.executionTime.min, card.executionTime.unit)} - ${formatValue(card.executionTime.max, card.executionTime.unit)}</div>`;
            }
            html += '</div>';
        }
        
        // Data Size section
        if (card.dataSize) {
            const trendSymbol = card.dataSize.trend === 'up' ? '↑' : card.dataSize.trend === 'down' ? '↓' : '→';
            const trendClass = card.dataSize.trend;
            html += '<div class="combined-metric-section">';
            html += '<div class="metric-label">Data Size</div>';
            html += `<div class="combined-metric-value">${formatValue(card.dataSize.current, card.dataSize.unit)}<span class="trend ${trendClass}">${trendSymbol}</span></div>`;
            if (card.dataSize.previous !== undefined) {
                const change = ((card.dataSize.current - card.dataSize.previous) / card.dataSize.previous * 100).toFixed(1);
                html += `<div class="metric-stats">Previous: ${formatValue(card.dataSize.previous, card.dataSize.unit)} (${change > 0 ? '+' : ''}${change}%)</div>`;
            }
            if (card.dataSize.min !== undefined && card.dataSize.max !== undefined) {
                html += `<div class="metric-stats">Range: ${formatValue(card.dataSize.min, card.dataSize.unit)} - ${formatValue(card.dataSize.max, card.dataSize.unit)}</div>`;
            }
            html += '</div>';
        }
        
        html += '</div>';
        
        cardDiv.innerHTML = html;
    } else {
        // Regular card (e.g., Rows)
        const trendSymbol = card.trend === 'up' ? '↑' : card.trend === 'down' ? '↓' : '→';
        const trendClass = card.trend;
        
        let html = `<div class="metric-label">${card.label}</div>`;
        html += `<div class="metric-value">${formatValue(card.current, card.unit)}<span class="trend ${trendClass}">${trendSymbol}</span></div>`;
        
        if (card.previous !== undefined) {
            const change = ((card.current - card.previous) / card.previous * 100).toFixed(1);
            html += `<div class="metric-stats">Previous: ${formatValue(card.previous, card.unit)} (${change > 0 ? '+' : ''}${change}%)</div>`;
        }
        
        if (card.min !== undefined && card.max !== undefined) {
            html += `<div class="metric-stats">Range: ${formatValue(card.min, card.unit)} - ${formatValue(card.max, card.unit)}</div>`;
        }
        
        cardDiv.innerHTML = html;
    }
    
    return cardDiv;
}

window.addEventListener('message', event => {
    const message = event.data;
    if (message.command === 'updateMetrics') {
        if (!container) {
            console.error('Metrics container not found');
            return;
        }
        
        if (message.cards && message.cards.length > 0) {
            // Clear container and render new cards
            container.innerHTML = '';
            console.log(`Rendering ${message.cards.length} metric cards`);
            message.cards.forEach((card, index) => {
                const cardElement = createCard(card);
                container.appendChild(cardElement);
                console.log(`Added card ${index + 1}: ${card.label}`);
            });
        } else {
            // Empty cards array - only clear if container is already empty or showing empty state
            // This preserves historical runs if they exist (defensive measure)
            const hasExistingCards = container.children.length > 0 && 
                                    !container.innerHTML.includes('empty-state');
            
            if (hasExistingCards) {
                // Preserve existing cards - don't clear historical runs
                console.log('Received empty cards but preserving existing historical runs');
                return;
            } else {
                // Container is empty or already showing empty state - show "No metrics available"
                container.innerHTML = '<div class="empty-state">No metrics available</div>';
            }
        }
    } else if (message.command === 'clearData') {
        if (container) {
            container.innerHTML = '<div class="empty-state">Waiting for stress test data...</div>';
        }
    }
});
