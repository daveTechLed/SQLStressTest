using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Hubs;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for handling SignalR connection lifecycle events.
/// Single Responsibility: Connection lifecycle management only.
/// </summary>
public class ConnectionLifecycleHandler
{
    private readonly ILogger<ConnectionLifecycleHandler> _logger;
    private readonly HeartbeatSender _heartbeatSender;
    private readonly ConnectionCacheService _connectionCacheService;
    private readonly IStorageService? _storageService;

    public ConnectionLifecycleHandler(
        ILogger<ConnectionLifecycleHandler> logger,
        HeartbeatSender heartbeatSender,
        ConnectionCacheService connectionCacheService,
        IStorageService? storageService = null)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _heartbeatSender = heartbeatSender ?? throw new ArgumentNullException(nameof(heartbeatSender));
        _connectionCacheService = connectionCacheService ?? throw new ArgumentNullException(nameof(connectionCacheService));
        _storageService = storageService;
    }

    /// <summary>
    /// Handles the OnConnectedAsync event for a SignalR hub.
    /// </summary>
    public async Task HandleConnectedAsync(
        HubCallerContext context,
        IClientProxy caller)
    {
        _logger.LogInformation("Client connecting to SqlHub. ConnectionId: {ConnectionId}, User: {User}, Context: {Context}",
            context.ConnectionId,
            context.User?.Identity?.Name ?? "Anonymous",
            context.GetHttpContext()?.Request?.Headers?.ToString() ?? "No context");

        try
        {
            // Send heartbeat
            await _heartbeatSender.SendHeartbeatAsync(caller, context.ConnectionId, "connected");

            _logger.LogInformation("Client connected successfully. ConnectionId: {ConnectionId}", context.ConnectionId);

            // Set the connection ID in the storage service so it can be used for storage operations
            if (_storageService != null && _storageService is VSCodeStorageService vscodeStorage)
            {
                // CRITICAL FIX: Capture the connection ID before Task.Run
                // The hub context may be disposed by the time the Task.Run executes
                var currentConnectionId = context.ConnectionId;
                vscodeStorage.SetConnectionId(currentConnectionId);
                _logger.LogDebug("Storage service connection ID set to {ConnectionId}", currentConnectionId);

                // Load connections from storage now that we have a SignalR connection
                // This ensures the backend knows about connections saved by the frontend
                // CRITICAL FIX: Add delay before calling LoadConnections to give frontend time to register handlers
                // This prevents "Client didn't provide a result" errors due to race condition
                _ = Task.Run(async () =>
                {
                    try
                    {
                        // Wait a short time for frontend to register handlers (prevents race condition)
                        await Task.Delay(500);

                        // Retry logic with exponential backoff if initial call fails
                        var maxRetries = 3;
                        var retryDelay = 500; // Start with 500ms

                        for (int attempt = 0; attempt < maxRetries; attempt++)
                        {
                            try
                            {
                                var response = await _storageService.LoadConnectionsAsync();
                                if (response.Success && response.Data != null)
                                {
                                    _logger.LogInformation("OnConnectedAsync: Loaded {Count} connections from storage after SignalR connection established (attempt {Attempt})",
                                        response.Data.Count, attempt + 1);

                                    // DIAGNOSTIC: Log cache state before populating
                                    lock (_connectionCacheService.GetCacheLock())
                                    {
                                        var cacheStateBefore = _connectionCacheService.GetCachedConnections() == null ? "null" :
                                            _connectionCacheService.GetCachedConnections()!.Count == 0 ? "empty" :
                                            $"{_connectionCacheService.GetCachedConnections()!.Count} items";
                                        _logger.LogInformation("OnConnectedAsync: Cache state before ReloadConnectionsAsync: {CacheState}", cacheStateBefore);
                                    }

                                    // CRITICAL FIX: Populate the cache after successfully loading connections
                                    // This ensures ExecuteQuery/ExecuteStressTest can find connections immediately
                                    // Use the captured connection ID instead of Context.ConnectionId to avoid ObjectDisposedException
                                    _logger.LogInformation("OnConnectedAsync: Calling ReloadConnectionsAsync with ConnectionId: {ConnectionId}", currentConnectionId);
                                    await _connectionCacheService.ReloadConnectionsAsync(currentConnectionId);

                                    // DIAGNOSTIC: Log cache state after populating
                                    lock (_connectionCacheService.GetCacheLock())
                                    {
                                        var cacheStateAfter = _connectionCacheService.GetCachedConnections() == null ? "null" :
                                            _connectionCacheService.GetCachedConnections()!.Count == 0 ? "empty" :
                                            $"{_connectionCacheService.GetCachedConnections()!.Count} items";
                                        var cacheIds = _connectionCacheService.GetCachedConnections()?.Select(c => c.Id ?? "(null)").ToList() ?? new List<string>();
                                        _logger.LogInformation("OnConnectedAsync: Cache state after ReloadConnectionsAsync: {CacheState}, Cache IDs: [{CacheIds}]",
                                            cacheStateAfter, string.Join(", ", cacheIds));
                                    }

                                    // Log the connection IDs that were loaded
                                    var connectionIds = response.Data.Select(c => c.Id ?? "(null)").ToList();
                                    _logger.LogInformation("Cache populated with {Count} connections after OnConnectedAsync. Connection IDs: {Ids}",
                                        response.Data.Count, string.Join(", ", connectionIds));
                                    break; // Success, exit retry loop
                                }
                                else if (!response.Success)
                                {
                                    if (response.Error?.Contains("No SignalR connection available") == true)
                                    {
                                        _logger.LogDebug("Cannot load connections: No SignalR connection (expected when no client connected)");
                                        break; // Expected error, don't retry
                                    }
                                    else if (response.Error?.Contains("Client didn't provide a result") == true && attempt < maxRetries - 1)
                                    {
                                        // Handler not ready yet, retry with exponential backoff
                                        _logger.LogDebug("LoadConnections failed (handler not ready), retrying in {Delay}ms (attempt {Attempt}/{MaxRetries})",
                                            retryDelay, attempt + 1, maxRetries);
                                        await Task.Delay(retryDelay);
                                        retryDelay *= 2; // Exponential backoff
                                        continue;
                                    }
                                    else
                                    {
                                        _logger.LogWarning("Failed to load connections after SignalR connection: {Error}", response.Error);
                                        break; // Unexpected error or max retries reached
                                    }
                                }
                            }
                            catch (Exception ex) when (ex.Message.Contains("Client didn't provide a result") && attempt < maxRetries - 1)
                            {
                                // Handler not ready yet, retry with exponential backoff
                                _logger.LogDebug("LoadConnections exception (handler not ready), retrying in {Delay}ms (attempt {Attempt}/{MaxRetries})",
                                    retryDelay, attempt + 1, maxRetries);
                                await Task.Delay(retryDelay);
                                retryDelay *= 2; // Exponential backoff
                            }
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
            _logger.LogError(ex, "Error during OnConnectedAsync for connection {ConnectionId}", context.ConnectionId);
            throw;
        }
    }

    /// <summary>
    /// Handles the OnDisconnectedAsync event for a SignalR hub.
    /// </summary>
    public async Task HandleDisconnectedAsync(
        HubCallerContext context,
        Exception? exception)
    {
        _logger.LogInformation("Client disconnecting from SqlHub. ConnectionId: {ConnectionId}", context.ConnectionId);

        if (exception != null)
        {
            _logger.LogError(exception, "Client disconnected with error. ConnectionId: {ConnectionId}, Error: {ErrorMessage}",
                context.ConnectionId,
                exception.Message);
        }

        try
        {
            _logger.LogInformation("Client disconnected successfully. ConnectionId: {ConnectionId}", context.ConnectionId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during OnDisconnectedAsync for connection {ConnectionId}", context.ConnectionId);
            throw;
        }
    }

    /// <summary>
    /// Gets the connection cache service instance.
    /// </summary>
    public ConnectionCacheService GetConnectionCacheService()
    {
        return _connectionCacheService;
    }
}

