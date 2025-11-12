using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Models;
using SQLStressTest.Service.Services;

namespace SQLStressTest.Service.Hubs;

public class SqlHub : Hub
{
    private readonly ILogger<SqlHub> _logger;
    private readonly VSCodeStorageService? _storageService;

    public SqlHub(ILogger<SqlHub> logger, VSCodeStorageService? storageService = null)
    {
        _logger = logger;
        _storageService = storageService;
    }

    public override async Task OnConnectedAsync()
    {
        _logger.LogInformation("Client connecting to SqlHub. ConnectionId: {ConnectionId}, User: {User}, Context: {Context}", 
            Context.ConnectionId, 
            Context.User?.Identity?.Name ?? "Anonymous",
            Context.GetHttpContext()?.Request?.Headers?.ToString() ?? "No context");

        try
        {
            await base.OnConnectedAsync();
            
            // Use strongly-typed DTO to enable source-generated serialization (no reflection needed)
            var heartbeat = new HeartbeatMessage
            {
                Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                Status = "connected"
            };
            
            _logger.LogInformation("Sending initial heartbeat to connection {ConnectionId}. Timestamp: {Timestamp}, HeartbeatType: {Type}, HeartbeatTypeName: {TypeName}", 
                Context.ConnectionId, 
                heartbeat.Timestamp,
                heartbeat.GetType(),
                heartbeat.GetType().FullName);
            
            // Log the actual object being sent
            _logger.LogDebug("Heartbeat object details: Type={Type}, Assembly={Assembly}, IsValueType={IsValueType}, IsPrimitive={IsPrimitive}",
                heartbeat.GetType(),
                heartbeat.GetType().Assembly.FullName,
                heartbeat.GetType().IsValueType,
                heartbeat.GetType().IsPrimitive);
            
            try
            {
            await Clients.Caller.SendAsync("Heartbeat", heartbeat);
                _logger.LogInformation("Heartbeat sent successfully to connection {ConnectionId}", Context.ConnectionId);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send heartbeat to connection {ConnectionId}. Heartbeat type: {Type}, Exception type: {ExceptionType}", 
                    Context.ConnectionId, 
                    heartbeat.GetType().FullName,
                    ex.GetType().FullName);
                throw;
            }
            
            _logger.LogInformation("Client connected successfully. ConnectionId: {ConnectionId}", Context.ConnectionId);
            
            // Set the connection ID in the storage service so it can be used for storage operations
            if (_storageService != null)
            {
                _storageService.SetConnectionId(Context.ConnectionId);
                _logger.LogDebug("Storage service connection ID set to {ConnectionId}", Context.ConnectionId);
                
                // Load connections from storage now that we have a SignalR connection
                // This ensures the backend knows about connections saved by the frontend
                _ = Task.Run(async () =>
                {
                    try
                    {
                        var response = await _storageService.LoadConnectionsAsync();
                        if (response.Success && response.Data != null)
                        {
                            _logger.LogInformation("Loaded {Count} connections from storage after SignalR connection established", response.Data.Count);
                        }
                        else if (!response.Success && !response.Error?.Contains("No SignalR connection available") == true)
                        {
                            _logger.LogWarning("Failed to load connections after SignalR connection: {Error}", response.Error);
                        }
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Error loading connections after SignalR connection established");
                    }
                });
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during OnConnectedAsync for connection {ConnectionId}", Context.ConnectionId);
            throw;
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        _logger.LogInformation("Client disconnecting from SqlHub. ConnectionId: {ConnectionId}", Context.ConnectionId);
        
        if (exception != null)
        {
            _logger.LogError(exception, "Client disconnected with error. ConnectionId: {ConnectionId}, Error: {ErrorMessage}", 
                Context.ConnectionId, 
                exception.Message);
        }
        
        try
        {
            await base.OnDisconnectedAsync(exception);
            _logger.LogInformation("Client disconnected successfully. ConnectionId: {ConnectionId}", Context.ConnectionId);
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
        try
        {
            _logger.LogInformation("Requesting SaveConnection from frontend. ConnectionId: {ConnectionId}, Name: {Name}", 
                connection.Id, connection.Name);
            
            var request = new SaveConnectionRequest { Connection = connection };
            var response = await Clients.Caller.InvokeAsync<StorageResponse>("SaveConnection", request, CancellationToken.None);
            
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

    public async Task<StorageResponse<List<ConnectionConfigDto>>> RequestLoadConnections()
    {
        try
        {
            _logger.LogInformation("Requesting LoadConnections from frontend");
            
            var request = new LoadConnectionsRequest();
            var response = await Clients.Caller.InvokeAsync<StorageResponse<List<ConnectionConfigDto>>>("LoadConnections", request, CancellationToken.None);
            
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

    public async Task<StorageResponse> RequestUpdateConnection(string id, ConnectionConfigDto connection)
    {
        try
        {
            _logger.LogInformation("Requesting UpdateConnection from frontend. ConnectionId: {ConnectionId}", id);
            
            var request = new UpdateConnectionRequest { Id = id, Connection = connection };
            var response = await Clients.Caller.InvokeAsync<StorageResponse>("UpdateConnection", request, CancellationToken.None);
            
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

    public async Task<StorageResponse> RequestDeleteConnection(string id)
    {
        try
        {
            _logger.LogInformation("Requesting DeleteConnection from frontend. ConnectionId: {ConnectionId}", id);
            
            var request = new DeleteConnectionRequest { Id = id };
            var response = await Clients.Caller.InvokeAsync<StorageResponse>("DeleteConnection", request, CancellationToken.None);
            
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

    public async Task<StorageResponse> RequestSaveQueryResult(QueryResultDto result)
    {
        try
        {
            _logger.LogDebug("Requesting SaveQueryResult from frontend. ConnectionId: {ConnectionId}, QueryId: {QueryId}", 
                result.ConnectionId, result.Id);
            
            var request = new SaveQueryResultRequest { Result = result };
            var response = await Clients.Caller.InvokeAsync<StorageResponse>("SaveQueryResult", request, CancellationToken.None);
            
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

    public async Task<StorageResponse<List<QueryResultDto>>> RequestLoadQueryResults(string connectionId)
    {
        try
        {
            _logger.LogInformation("Requesting LoadQueryResults from frontend. ConnectionId: {ConnectionId}", connectionId);
            
            var request = new LoadQueryResultsRequest { ConnectionId = connectionId };
            var response = await Clients.Caller.InvokeAsync<StorageResponse<List<QueryResultDto>>>("LoadQueryResults", request, CancellationToken.None);
            
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

    public async Task<StorageResponse> RequestSavePerformanceMetrics(PerformanceMetricsDto metrics)
    {
        try
        {
            _logger.LogDebug("Requesting SavePerformanceMetrics from frontend. ConnectionId: {ConnectionId}, MetricsId: {MetricsId}", 
                metrics.ConnectionId, metrics.Id);
            
            var request = new SavePerformanceMetricsRequest { Metrics = metrics };
            var response = await Clients.Caller.InvokeAsync<StorageResponse>("SavePerformanceMetrics", request, CancellationToken.None);
            
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

    public async Task<StorageResponse<List<PerformanceMetricsDto>>> RequestLoadPerformanceMetrics(string connectionId, TimeRangeDto timeRange)
    {
        try
        {
            _logger.LogInformation("Requesting LoadPerformanceMetrics from frontend. ConnectionId: {ConnectionId}", connectionId);
            
            var request = new LoadPerformanceMetricsRequest { ConnectionId = connectionId, TimeRange = timeRange };
            var response = await Clients.Caller.InvokeAsync<StorageResponse<List<PerformanceMetricsDto>>>("LoadPerformanceMetrics", request, CancellationToken.None);
            
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
    /// Hub method that frontend can invoke to notify backend that a connection was saved.
    /// This triggers a reload of connections from storage so the backend cache stays in sync.
    /// </summary>
    public Task NotifyConnectionSaved(string connectionId)
    {
        try
        {
            _logger.LogInformation("=== CONNECTION SAVE NOTIFICATION RECEIVED ===");
            _logger.LogInformation("ConnectionId: {ConnectionId}", connectionId);
            _logger.LogInformation("Timestamp: {Timestamp}", DateTimeOffset.UtcNow);
            
            // CRITICAL FIX: Capture the current hub connection ID before Task.Run
            // The storage service is a singleton and may have a stale connection ID
            // We need to use the connection ID from the current hub context (the one that notified us)
            var currentHubConnectionId = Context.ConnectionId;
            
            // Trigger reload of connections from storage
            // Use static method since we don't have direct access to SqlController instance
            // Pass the connection ID so ReloadConnectionsStaticAsync can set it before reloading
            _ = Task.Run(async () =>
            {
                try
                {
                    _logger.LogInformation("Starting connection reload after save notification. ConnectionId: {ConnectionId}", connectionId);
                    
                    // Get connection count before reload
                    int? countBefore = null;
                    lock (SQLStressTest.Service.Controllers.SqlController.GetCacheLock())
                    {
                        var cached = SQLStressTest.Service.Controllers.SqlController.GetCachedConnections();
                        countBefore = cached?.Count;
                    }
                    _logger.LogInformation("Connection count before reload: {Count}", countBefore ?? 0);
                    
                    // Pass the connection ID to ensure the correct connection is used for the reload
                    await SQLStressTest.Service.Controllers.SqlController.ReloadConnectionsStaticAsync(currentHubConnectionId);
                    
                    // Get connection count after reload
                    int? countAfter = null;
                    lock (SQLStressTest.Service.Controllers.SqlController.GetCacheLock())
                    {
                        var cached = SQLStressTest.Service.Controllers.SqlController.GetCachedConnections();
                        countAfter = cached?.Count;
                    }
                    _logger.LogInformation("Connection count after reload: {Count}", countAfter ?? 0);
                    
                    // Verify the saved connection is in the cache
                    lock (SQLStressTest.Service.Controllers.SqlController.GetCacheLock())
                    {
                        var cached = SQLStressTest.Service.Controllers.SqlController.GetCachedConnections();
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
}

