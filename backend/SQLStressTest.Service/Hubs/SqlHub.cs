using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;
using SQLStressTest.Service.Services;

namespace SQLStressTest.Service.Hubs;

public class SqlHub : Hub
{
    private readonly ILogger<SqlHub> _logger;
    private readonly VSCodeStorageService? _storageService;
    private readonly IConnectionLifecycleHandler _lifecycleHandler;
    private readonly IStorageRequestHandler _storageRequestHandler;

    public SqlHub(
        ILogger<SqlHub> logger,
        VSCodeStorageService? storageService = null,
        IConnectionLifecycleHandler? lifecycleHandler = null,
        IStorageRequestHandler? storageRequestHandler = null)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _storageService = storageService;
        _lifecycleHandler = lifecycleHandler ?? throw new ArgumentNullException(nameof(lifecycleHandler));
        _storageRequestHandler = storageRequestHandler ?? throw new ArgumentNullException(nameof(storageRequestHandler));
    }

    public override async Task OnConnectedAsync()
    {
        try
        {
            await base.OnConnectedAsync();
            await _lifecycleHandler.HandleConnectedAsync(Context, Clients.Caller);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during OnConnectedAsync for connection {ConnectionId}", Context.ConnectionId);
            throw;
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        try
        {
            await base.OnDisconnectedAsync(exception);
            await _lifecycleHandler.HandleDisconnectedAsync(Context, exception);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during OnDisconnectedAsync for connection {ConnectionId}", Context.ConnectionId);
            throw;
        }
    }

    // Storage operation methods - backend requests frontend to perform storage operations

    public async Task<StorageResponse> RequestSaveConnection(ConnectionConfigDto connection)
    {
        return await _storageRequestHandler.RequestSaveConnection(Clients.Caller, connection);
    }

    public async Task<StorageResponse<List<ConnectionConfigDto>>> RequestLoadConnections()
    {
        return await _storageRequestHandler.RequestLoadConnections(Clients.Caller);
    }

    public async Task<StorageResponse> RequestUpdateConnection(string id, ConnectionConfigDto connection)
    {
        return await _storageRequestHandler.RequestUpdateConnection(Clients.Caller, id, connection);
    }

    public async Task<StorageResponse> RequestDeleteConnection(string id)
    {
        return await _storageRequestHandler.RequestDeleteConnection(Clients.Caller, id);
    }

    public async Task<StorageResponse> RequestSaveQueryResult(QueryResultDto result)
    {
        return await _storageRequestHandler.RequestSaveQueryResult(Clients.Caller, result);
    }

    public async Task<StorageResponse<List<QueryResultDto>>> RequestLoadQueryResults(string connectionId)
    {
        return await _storageRequestHandler.RequestLoadQueryResults(Clients.Caller, connectionId);
    }

    public async Task<StorageResponse> RequestSavePerformanceMetrics(PerformanceMetricsDto metrics)
    {
        return await _storageRequestHandler.RequestSavePerformanceMetrics(Clients.Caller, metrics);
    }

    public async Task<StorageResponse<List<PerformanceMetricsDto>>> RequestLoadPerformanceMetrics(string connectionId, TimeRangeDto timeRange)
    {
        return await _storageRequestHandler.RequestLoadPerformanceMetrics(Clients.Caller, connectionId, timeRange);
    }

    /// <summary>
    /// Hub method that frontend can invoke to notify backend that a connection was saved.
    /// This triggers a reload of connections from storage so the backend cache stays in sync.
    /// </summary>
    public Task NotifyConnectionSaved(string connectionId)
    {
        try
        {
            var currentHubConnectionId = Context.ConnectionId;
            var connectionCacheService = _lifecycleHandler.GetConnectionCacheService();
            _ = Task.Run(async () =>
            {
                await _storageRequestHandler.HandleConnectionSavedNotification(
                    connectionId,
                    currentHubConnectionId,
                    connectionCacheService,
                    _storageService);
            });
            
            return Task.CompletedTask;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "=== ERROR HANDLING CONNECTION SAVE NOTIFICATION ===");
            _logger.LogError(ex, "ConnectionId: {ConnectionId}, Error: {Error}", connectionId, ex.Message);
            return Task.FromException(ex);
        }
    }

    /// <summary>
    /// Send Extended Events data to all connected clients
    /// Called by StressTestService to stream events in real-time
    /// </summary>
    public async Task SendExtendedEventDataAsync(ExtendedEventData eventData)
    {
        try
        {
            await Clients.All.SendAsync("ExtendedEventData", eventData);
            _logger.LogTrace("ExtendedEventData sent. EventName: {EventName}, ExecutionId: {ExecutionId}",
                eventData.EventName, eventData.ExecutionId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending ExtendedEventData. EventName: {EventName}", eventData.EventName);
        }
    }

    /// <summary>
    /// Send execution boundary to all connected clients
    /// Called by StressTestService to mark execution start/end times
    /// </summary>
    public async Task SendExecutionBoundaryAsync(ExecutionBoundary boundary)
    {
        try
        {
            await Clients.All.SendAsync("ExecutionBoundary", boundary);
            _logger.LogTrace("ExecutionBoundary sent. ExecutionNumber: {ExecutionNumber}, IsStart: {IsStart}",
                boundary.ExecutionNumber, boundary.IsStart);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error sending ExecutionBoundary. ExecutionNumber: {ExecutionNumber}",
                boundary.ExecutionNumber);
        }
    }
}

