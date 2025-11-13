using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Hubs;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Storage service implementation that uses SignalR to request storage operations from VS Code frontend
/// This service wraps the hub methods and can be called from other services
/// </summary>
public class VSCodeStorageService : IStorageService
{
    private readonly IHubContext<SqlHub> _hubContext;
    private readonly ILogger<VSCodeStorageService> _logger;
    private readonly SemaphoreSlim _connectionSemaphore = new(1, 1);
    private string? _currentConnectionId;

    public VSCodeStorageService(IHubContext<SqlHub> hubContext, ILogger<VSCodeStorageService> logger)
    {
        _hubContext = hubContext;
        _logger = logger;
    }

    /// <summary>
    /// Sets the current SignalR connection ID to use for storage operations
    /// </summary>
    public void SetConnectionId(string connectionId)
    {
        _currentConnectionId = connectionId;
        _logger.LogDebug("Storage service connection ID set to {ConnectionId}", connectionId);
    }

    /// <summary>
    /// Gets the current SignalR connection ID being used for storage operations
    /// </summary>
    public string? GetConnectionId()
    {
        return _currentConnectionId;
    }

    private async Task<StorageResponse> InvokeStorageOperationAsync(
        Func<ISingleClientProxy, Task<StorageResponse>> operation,
        string operationName)
    {
        if (string.IsNullOrEmpty(_currentConnectionId))
        {
            _logger.LogDebug("Cannot perform {OperationName}: No connection ID set (expected when no SignalR client connected)", operationName);
            // Return graceful failure response instead of throwing
            return StorageResponse.CreateError("No SignalR connection available");
        }

        try
        {
            await _connectionSemaphore.WaitAsync();
            
            var client = _hubContext.Clients.Client(_currentConnectionId);
            if (client == null)
            {
                _logger.LogWarning("Cannot perform {OperationName}: Client {ConnectionId} not found", 
                    operationName, _currentConnectionId);
                return StorageResponse.CreateError($"Client {_currentConnectionId} not found");
            }

            _logger.LogDebug("Invoking {OperationName} on connection {ConnectionId}", 
                operationName, _currentConnectionId);
            
            var result = await operation(client);
            
            _logger.LogDebug("{OperationName} completed successfully", operationName);
            return result;
        }
        catch (Microsoft.AspNetCore.SignalR.HubException hubEx) when (hubEx.Message.Contains("Client didn't provide a result"))
        {
            // Better error message for timing/handler registration issues
            _logger.LogWarning(hubEx, 
                "Error performing {OperationName}: Handler not registered yet (timing issue). This may indicate the frontend hasn't registered handlers before backend called this method.", 
                operationName);
            return StorageResponse.CreateError(
                $"Handler not ready: The frontend handler for {operationName} may not be registered yet. This is typically a timing issue - handlers should be registered before SignalR connection completes.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error performing {OperationName}", operationName);
            return StorageResponse.CreateError($"Error: {ex.Message}");
        }
        finally
        {
            _connectionSemaphore.Release();
        }
    }

    private async Task<StorageResponse<T>> InvokeStorageOperationAsync<T>(
        Func<ISingleClientProxy, Task<StorageResponse<T>>> operation,
        string operationName)
    {
        if (string.IsNullOrEmpty(_currentConnectionId))
        {
            _logger.LogDebug("Cannot perform {OperationName}: No connection ID set (expected when no SignalR client connected)", operationName);
            // Return graceful failure response instead of throwing
            return StorageResponse.CreateError<T>("No SignalR connection available");
        }

        try
        {
            await _connectionSemaphore.WaitAsync();
            
            var client = _hubContext.Clients.Client(_currentConnectionId);
            if (client == null)
            {
                _logger.LogWarning("Cannot perform {OperationName}: Client {ConnectionId} not found", 
                    operationName, _currentConnectionId);
                return StorageResponse.CreateError<T>($"Client {_currentConnectionId} not found");
            }

            _logger.LogDebug("Invoking {OperationName} on connection {ConnectionId}", 
                operationName, _currentConnectionId);
            
            var result = await operation(client);
            
            _logger.LogDebug("{OperationName} completed successfully", operationName);
            return result;
        }
        catch (Microsoft.AspNetCore.SignalR.HubException hubEx) when (hubEx.Message.Contains("Client didn't provide a result"))
        {
            // Better error message for timing/handler registration issues
            _logger.LogWarning(hubEx, 
                "Error performing {OperationName}: Handler not registered yet (timing issue). This may indicate the frontend hasn't registered handlers before backend called this method.", 
                operationName);
            return StorageResponse.CreateError<T>(
                $"Handler not ready: The frontend handler for {operationName} may not be registered yet. This is typically a timing issue - handlers should be registered before SignalR connection completes.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error performing {OperationName}", operationName);
            return StorageResponse.CreateError<T>($"Error: {ex.Message}");
        }
        finally
        {
            _connectionSemaphore.Release();
        }
    }

    public async Task<StorageResponse> SaveConnectionAsync(ConnectionConfigDto connection)
    {
        return await InvokeStorageOperationAsync(async (client) =>
        {
            var request = new SaveConnectionRequest { Connection = connection };
            return await client.InvokeAsync<StorageResponse>("SaveConnection", request, CancellationToken.None);
        }, "SaveConnection");
    }

    public async Task<StorageResponse<List<ConnectionConfigDto>>> LoadConnectionsAsync()
    {
        return await InvokeStorageOperationAsync(async (client) =>
        {
            var request = new LoadConnectionsRequest();
            return await client.InvokeAsync<StorageResponse<List<ConnectionConfigDto>>>("LoadConnections", request, CancellationToken.None);
        }, "LoadConnections");
    }

    public async Task<StorageResponse> UpdateConnectionAsync(string id, ConnectionConfigDto connection)
    {
        return await InvokeStorageOperationAsync(async (client) =>
        {
            var request = new UpdateConnectionRequest { Id = id, Connection = connection };
            return await client.InvokeAsync<StorageResponse>("UpdateConnection", request, CancellationToken.None);
        }, "UpdateConnection");
    }

    public async Task<StorageResponse> DeleteConnectionAsync(string id)
    {
        return await InvokeStorageOperationAsync(async (client) =>
        {
            var request = new DeleteConnectionRequest { Id = id };
            return await client.InvokeAsync<StorageResponse>("DeleteConnection", request, CancellationToken.None);
        }, "DeleteConnection");
    }

    public async Task<StorageResponse> SaveQueryResultAsync(QueryResultDto result)
    {
        return await InvokeStorageOperationAsync(async (client) =>
        {
            var request = new SaveQueryResultRequest { Result = result };
            return await client.InvokeAsync<StorageResponse>("SaveQueryResult", request, CancellationToken.None);
        }, "SaveQueryResult");
    }

    public async Task<StorageResponse<List<QueryResultDto>>> LoadQueryResultsAsync(string connectionId)
    {
        return await InvokeStorageOperationAsync(async (client) =>
        {
            var request = new LoadQueryResultsRequest { ConnectionId = connectionId };
            return await client.InvokeAsync<StorageResponse<List<QueryResultDto>>>("LoadQueryResults", request, CancellationToken.None);
        }, "LoadQueryResults");
    }

    public async Task<StorageResponse> SavePerformanceMetricsAsync(PerformanceMetricsDto metrics)
    {
        return await InvokeStorageOperationAsync(async (client) =>
        {
            var request = new SavePerformanceMetricsRequest { Metrics = metrics };
            return await client.InvokeAsync<StorageResponse>("SavePerformanceMetrics", request, CancellationToken.None);
        }, "SavePerformanceMetrics");
    }

    public async Task<StorageResponse<List<PerformanceMetricsDto>>> LoadPerformanceMetricsAsync(string connectionId, TimeRangeDto timeRange)
    {
        return await InvokeStorageOperationAsync(async (client) =>
        {
            var request = new LoadPerformanceMetricsRequest { ConnectionId = connectionId, TimeRange = timeRange };
            return await client.InvokeAsync<StorageResponse<List<PerformanceMetricsDto>>>("LoadPerformanceMetrics", request, CancellationToken.None);
        }, "LoadPerformanceMetrics");
    }
}
