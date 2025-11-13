using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for handling storage operation requests from backend to frontend via SignalR.
/// Single Responsibility: Storage request handling only.
/// </summary>
public class StorageRequestHandler
{
    private readonly ILogger<StorageRequestHandler> _logger;

    public StorageRequestHandler(ILogger<StorageRequestHandler> logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Requests the frontend to save a connection configuration.
    /// </summary>
    public async Task<StorageResponse> RequestSaveConnection(ISingleClientProxy caller, ConnectionConfigDto connection)
    {
        try
        {
            _logger.LogInformation("Requesting SaveConnection from frontend. ConnectionId: {ConnectionId}, Name: {Name}",
                connection.Id, connection.Name);

            var request = new SaveConnectionRequest { Connection = connection };
            var response = await caller.InvokeAsync<StorageResponse>("SaveConnection", request, CancellationToken.None);

            if (response?.Success == true)
            {
                _logger.LogInformation("SaveConnection successful. ConnectionId: {ConnectionId}", connection.Id);
            }
            else
            {
                _logger.LogWarning("SaveConnection failed. ConnectionId: {ConnectionId}, Error: {Error}",
                    connection.Id, response?.Error ?? "Unknown error");
            }

            return response ?? StorageResponse.CreateError("No response from frontend");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error requesting SaveConnection. ConnectionId: {ConnectionId}", connection.Id);
            return StorageResponse.CreateError($"Error: {ex.Message}");
        }
    }

    /// <summary>
    /// Requests the frontend to load all connection configurations.
    /// </summary>
    public async Task<StorageResponse<List<ConnectionConfigDto>>> RequestLoadConnections(ISingleClientProxy caller)
    {
        try
        {
            _logger.LogInformation("Requesting LoadConnections from frontend");

            var request = new LoadConnectionsRequest();
            var response = await caller.InvokeAsync<StorageResponse<List<ConnectionConfigDto>>>("LoadConnections", request, CancellationToken.None);

            if (response?.Success == true)
            {
                _logger.LogInformation("LoadConnections successful. Count: {Count}", response.Data?.Count ?? 0);
            }
            else
            {
                _logger.LogWarning("LoadConnections failed. Error: {Error}", response?.Error ?? "Unknown error");
            }

            return response ?? new StorageResponse<List<ConnectionConfigDto>> { Success = false, Error = "No response from frontend" };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error requesting LoadConnections");
            return new StorageResponse<List<ConnectionConfigDto>> { Success = false, Error = $"Error: {ex.Message}" };
        }
    }

    /// <summary>
    /// Requests the frontend to update a connection configuration.
    /// </summary>
    public async Task<StorageResponse> RequestUpdateConnection(ISingleClientProxy caller, string id, ConnectionConfigDto connection)
    {
        try
        {
            _logger.LogInformation("Requesting UpdateConnection from frontend. ConnectionId: {ConnectionId}", id);

            var request = new UpdateConnectionRequest { Id = id, Connection = connection };
            var response = await caller.InvokeAsync<StorageResponse>("UpdateConnection", request, CancellationToken.None);

            if (response?.Success == true)
            {
                _logger.LogInformation("UpdateConnection successful. ConnectionId: {ConnectionId}", id);
            }
            else
            {
                _logger.LogWarning("UpdateConnection failed. ConnectionId: {ConnectionId}, Error: {Error}",
                    id, response?.Error ?? "Unknown error");
            }

            return response ?? StorageResponse.CreateError("No response from frontend");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error requesting UpdateConnection. ConnectionId: {ConnectionId}", id);
            return StorageResponse.CreateError($"Error: {ex.Message}");
        }
    }

    /// <summary>
    /// Requests the frontend to delete a connection configuration.
    /// </summary>
    public async Task<StorageResponse> RequestDeleteConnection(ISingleClientProxy caller, string id)
    {
        try
        {
            _logger.LogInformation("Requesting DeleteConnection from frontend. ConnectionId: {ConnectionId}", id);

            var request = new DeleteConnectionRequest { Id = id };
            var response = await caller.InvokeAsync<StorageResponse>("DeleteConnection", request, CancellationToken.None);

            if (response?.Success == true)
            {
                _logger.LogInformation("DeleteConnection successful. ConnectionId: {ConnectionId}", id);
            }
            else
            {
                _logger.LogWarning("DeleteConnection failed. ConnectionId: {ConnectionId}, Error: {Error}",
                    id, response?.Error ?? "Unknown error");
            }

            return response ?? StorageResponse.CreateError("No response from frontend");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error requesting DeleteConnection. ConnectionId: {ConnectionId}", id);
            return StorageResponse.CreateError($"Error: {ex.Message}");
        }
    }

    /// <summary>
    /// Requests the frontend to save a query result.
    /// </summary>
    public async Task<StorageResponse> RequestSaveQueryResult(ISingleClientProxy caller, QueryResultDto result)
    {
        try
        {
            _logger.LogDebug("Requesting SaveQueryResult from frontend. ConnectionId: {ConnectionId}, QueryId: {QueryId}",
                result.ConnectionId, result.Id);

            var request = new SaveQueryResultRequest { Result = result };
            var response = await caller.InvokeAsync<StorageResponse>("SaveQueryResult", request, CancellationToken.None);

            if (response?.Success == true)
            {
                _logger.LogDebug("SaveQueryResult successful. QueryId: {QueryId}", result.Id);
            }
            else
            {
                _logger.LogWarning("SaveQueryResult failed. QueryId: {QueryId}, Error: {Error}",
                    result.Id, response?.Error ?? "Unknown error");
            }

            return response ?? StorageResponse.CreateError("No response from frontend");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error requesting SaveQueryResult. QueryId: {QueryId}", result.Id);
            return StorageResponse.CreateError($"Error: {ex.Message}");
        }
    }

    /// <summary>
    /// Requests the frontend to load query results for a connection.
    /// </summary>
    public async Task<StorageResponse<List<QueryResultDto>>> RequestLoadQueryResults(ISingleClientProxy caller, string connectionId)
    {
        try
        {
            _logger.LogInformation("Requesting LoadQueryResults from frontend. ConnectionId: {ConnectionId}", connectionId);

            var request = new LoadQueryResultsRequest { ConnectionId = connectionId };
            var response = await caller.InvokeAsync<StorageResponse<List<QueryResultDto>>>("LoadQueryResults", request, CancellationToken.None);

            if (response?.Success == true)
            {
                _logger.LogInformation("LoadQueryResults successful. ConnectionId: {ConnectionId}, Count: {Count}",
                    connectionId, response.Data?.Count ?? 0);
            }
            else
            {
                _logger.LogWarning("LoadQueryResults failed. ConnectionId: {ConnectionId}, Error: {Error}",
                    connectionId, response?.Error ?? "Unknown error");
            }

            return response ?? new StorageResponse<List<QueryResultDto>> { Success = false, Error = "No response from frontend" };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error requesting LoadQueryResults. ConnectionId: {ConnectionId}", connectionId);
            return new StorageResponse<List<QueryResultDto>> { Success = false, Error = $"Error: {ex.Message}" };
        }
    }

    /// <summary>
    /// Requests the frontend to save performance metrics.
    /// </summary>
    public async Task<StorageResponse> RequestSavePerformanceMetrics(ISingleClientProxy caller, PerformanceMetricsDto metrics)
    {
        try
        {
            _logger.LogDebug("Requesting SavePerformanceMetrics from frontend. ConnectionId: {ConnectionId}, MetricsId: {MetricsId}",
                metrics.ConnectionId, metrics.Id);

            var request = new SavePerformanceMetricsRequest { Metrics = metrics };
            var response = await caller.InvokeAsync<StorageResponse>("SavePerformanceMetrics", request, CancellationToken.None);

            if (response?.Success == true)
            {
                _logger.LogDebug("SavePerformanceMetrics successful. MetricsId: {MetricsId}", metrics.Id);
            }
            else
            {
                _logger.LogWarning("SavePerformanceMetrics failed. MetricsId: {MetricsId}, Error: {Error}",
                    metrics.Id, response?.Error ?? "Unknown error");
            }

            return response ?? StorageResponse.CreateError("No response from frontend");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error requesting SavePerformanceMetrics. MetricsId: {MetricsId}", metrics.Id);
            return StorageResponse.CreateError($"Error: {ex.Message}");
        }
    }

    /// <summary>
    /// Requests the frontend to load performance metrics for a connection.
    /// </summary>
    public async Task<StorageResponse<List<PerformanceMetricsDto>>> RequestLoadPerformanceMetrics(ISingleClientProxy caller, string connectionId, TimeRangeDto timeRange)
    {
        try
        {
            _logger.LogInformation("Requesting LoadPerformanceMetrics from frontend. ConnectionId: {ConnectionId}", connectionId);

            var request = new LoadPerformanceMetricsRequest { ConnectionId = connectionId, TimeRange = timeRange };
            var response = await caller.InvokeAsync<StorageResponse<List<PerformanceMetricsDto>>>("LoadPerformanceMetrics", request, CancellationToken.None);

            if (response?.Success == true)
            {
                _logger.LogInformation("LoadPerformanceMetrics successful. ConnectionId: {ConnectionId}, Count: {Count}",
                    connectionId, response.Data?.Count ?? 0);
            }
            else
            {
                _logger.LogWarning("LoadPerformanceMetrics failed. ConnectionId: {ConnectionId}, Error: {Error}",
                    connectionId, response?.Error ?? "Unknown error");
            }

            return response ?? new StorageResponse<List<PerformanceMetricsDto>> { Success = false, Error = "No response from frontend" };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error requesting LoadPerformanceMetrics. ConnectionId: {ConnectionId}", connectionId);
            return new StorageResponse<List<PerformanceMetricsDto>> { Success = false, Error = $"Error: {ex.Message}" };
        }
    }

    /// <summary>
    /// Handles notification that a connection was saved, triggering a cache reload.
    /// </summary>
    public async Task HandleConnectionSavedNotification(
        string connectionId,
        string hubConnectionId,
        ConnectionCacheService connectionCacheService,
        IStorageService? storageService)
    {
        try
        {
            _logger.LogInformation("=== CONNECTION SAVE NOTIFICATION RECEIVED ===");
            _logger.LogInformation("ConnectionId: {ConnectionId}", connectionId);
            _logger.LogInformation("Timestamp: {Timestamp}", DateTimeOffset.UtcNow);

            _logger.LogInformation("Starting connection reload after save notification. ConnectionId: {ConnectionId}", connectionId);

            // Get connection count before reload
            int? countBefore = null;
            lock (connectionCacheService.GetCacheLock())
            {
                var cached = connectionCacheService.GetCachedConnections();
                countBefore = cached?.Count;
            }
            _logger.LogInformation("Connection count before reload: {Count}", countBefore ?? 0);

            // Reload connections using the cache service
            if (storageService != null)
            {
                await connectionCacheService.ReloadConnectionsAsync(hubConnectionId);
            }
            else
            {
                _logger.LogWarning("HandleConnectionSavedNotification: Cannot reload connections - storage service is null");
            }

            // Get connection count after reload
            int? countAfter = null;
            lock (connectionCacheService.GetCacheLock())
            {
                var cached = connectionCacheService.GetCachedConnections();
                countAfter = cached?.Count;
            }
            _logger.LogInformation("Connection count after reload: {Count}", countAfter ?? 0);

            // Verify the saved connection is in the cache
            lock (connectionCacheService.GetCacheLock())
            {
                var cached = connectionCacheService.GetCachedConnections();
                var found = cached?.FirstOrDefault(c => c.Id == connectionId);
                if (found != null)
                {
                    _logger.LogInformation("=== CONNECTION SAVE VERIFIED ===");
                    _logger.LogInformation("Connection found in cache: Id={Id}, Name={Name}, Server={Server}, Port={Port}",
                        found.Id, found.Name, found.Server, found.Port);
                }
                else
                {
                    _logger.LogWarning("=== CONNECTION SAVE VERIFICATION FAILED ===");
                    _logger.LogWarning("Connection NOT found in cache after reload. ConnectionId: {ConnectionId}", connectionId);
                    _logger.LogWarning("Available connection IDs: {Ids}",
                        string.Join(", ", cached?.Select(c => c.Id) ?? Array.Empty<string>()));
                }
            }

            _logger.LogInformation("=== CONNECTION RELOAD COMPLETED ===");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "=== ERROR RELOADING CONNECTIONS ===");
            _logger.LogError(ex, "ConnectionId: {ConnectionId}, Error: {Error}", connectionId, ex.Message);
        }
    }
}

