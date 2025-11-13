using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for managing the connection configuration cache.
/// Single Responsibility: Connection cache management only.
/// </summary>
public class ConnectionCacheService
{
    private readonly IStorageService? _storageService;
    private readonly ILogger<ConnectionCacheService>? _logger;
    private List<ConnectionConfigDto>? _cachedConnections;
    private readonly object _cacheLock = new();

    public ConnectionCacheService(
        IStorageService? storageService = null,
        ILogger<ConnectionCacheService>? logger = null)
    {
        _storageService = storageService;
        _logger = logger;
    }

    /// <summary>
    /// Get the cache lock object for thread-safe access to cached connections.
    /// </summary>
    public object GetCacheLock()
    {
        return _cacheLock;
    }

    /// <summary>
    /// Get the cached connections list (thread-safe access required via GetCacheLock).
    /// </summary>
    public List<ConnectionConfigDto>? GetCachedConnections()
    {
        return _cachedConnections;
    }

    /// <summary>
    /// Load connections from storage and update the cache.
    /// </summary>
    public async Task LoadConnectionsAsync()
    {
        if (_storageService == null)
        {
            _logger?.LogWarning("LoadConnectionsAsync: Cannot load - storage service is null");
            return;
        }

        // DIAGNOSTIC: Log cache state before loading
        lock (_cacheLock)
        {
            var cacheStateBefore = _cachedConnections == null ? "null" :
                _cachedConnections.Count == 0 ? "empty" : $"{_cachedConnections.Count} items";
            var storageServiceType = _storageService is VSCodeStorageService vscode ?
                $"VSCodeStorageService (ConnectionId: {vscode.GetConnectionId() ?? "not set"})" :
                _storageService.GetType().Name;
            _logger?.LogInformation("LoadConnectionsAsync: Starting load. Cache state before: {CacheState}, StorageService: {StorageServiceType}",
                cacheStateBefore, storageServiceType);
        }

        try
        {
            _logger?.LogInformation("LoadConnectionsAsync: Calling LoadConnectionsAsync on storage service...");
            var response = await _storageService.LoadConnectionsAsync();
            _logger?.LogInformation("LoadConnectionsAsync: LoadConnectionsAsync completed. Success: {Success}, Error: {Error}, Data: {Data}",
                response.Success, response.Error ?? "(none)", response.Data != null ? $"{response.Data.Count} items" : "null");

            if (response.Success && response.Data != null)
            {
                lock (_cacheLock)
                {
                    var previousCount = _cachedConnections?.Count ?? 0;
                    var previousIds = _cachedConnections?.Select(c => c.Id ?? "(null)").ToList() ?? new List<string>();
                    _cachedConnections = response.Data;
                    var newIds = response.Data.Select(c => c.Id ?? "(null)").ToList();

                    _logger?.LogInformation("LoadConnectionsAsync: Cache updated. Previous: {PreviousCount} items [{PreviousIds}], New: {NewCount} items [{NewIds}]",
                        previousCount, string.Join(", ", previousIds), response.Data.Count, string.Join(", ", newIds));
                }
            }
            else if (!response.Success)
            {
                // Only log as ERROR if it's an unexpected failure
                // "No SignalR connection available" is expected when no client is connected
                if (response.Error?.Contains("No SignalR connection available") == true)
                {
                    _logger?.LogDebug("LoadConnectionsAsync: Cannot load connections: No SignalR connection (expected when no client connected)");
                }
                else
                {
                    _logger?.LogWarning("LoadConnectionsAsync: Failed to load connections from storage. Error: {Error}, StorageService type: {Type}",
                        response.Error, _storageService.GetType().FullName);
                }
            }
            else if (response.Data == null)
            {
                _logger?.LogWarning("LoadConnectionsAsync: LoadConnectionsAsync returned success but Data is null. StorageService type: {Type}",
                    _storageService.GetType().FullName);
            }
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "LoadConnectionsAsync: Error loading connections from storage. Exception: {Exception}", ex);
        }
    }

    /// <summary>
    /// Reload connections from storage, optionally setting the connection ID on the storage service first.
    /// </summary>
    /// <param name="connectionId">Optional SignalR connection ID to use for the reload. If provided, sets this on the storage service before reloading.
    /// WARNING: This must be a SignalR connection ID (e.g., from Context.ConnectionId), NOT a SQL connection config ID.
    /// If null, uses the connection ID already set on the storage service.</param>
    public async Task ReloadConnectionsAsync(string? connectionId = null)
    {
        // DIAGNOSTIC: Log cache state before reload
        lock (_cacheLock)
        {
            var cacheStateBefore = _cachedConnections == null ? "null" :
                _cachedConnections.Count == 0 ? "empty" : $"{_cachedConnections.Count} items";
            var cacheIdsBefore = _cachedConnections?.Select(c => c.Id ?? "(null)").ToList() ?? new List<string>();
            _logger?.LogInformation("ReloadConnectionsAsync: Starting reload. ConnectionId param: {ConnectionId}, Cache state before: {CacheState}, Cache IDs: [{CacheIds}]",
                connectionId ?? "(null)", cacheStateBefore, string.Join(", ", cacheIdsBefore));
        }

        if (_storageService == null)
        {
            _logger?.LogError("ReloadConnectionsAsync: Cannot reload - storage service is null!");
            return;
        }

        try
        {
            // CRITICAL FIX: If a connection ID is provided, set it on the storage service before reloading
            // This ensures we use the correct connection ID (the one that notified us of the save)
            // rather than relying on a potentially stale connection ID
            if (!string.IsNullOrEmpty(connectionId) && _storageService is VSCodeStorageService vscodeStorage)
            {
                var previousConnectionId = vscodeStorage.GetConnectionId();
                vscodeStorage.SetConnectionId(connectionId);
                _logger?.LogInformation("ReloadConnectionsAsync: Storage service connection ID set to {ConnectionId} (was: {PreviousConnectionId})",
                    connectionId, previousConnectionId ?? "(null)");
            }
            else if (_storageService is VSCodeStorageService vscodeStorage2)
            {
                // If no connection ID provided, check if storage service has one set
                var existingConnectionId = vscodeStorage2.GetConnectionId();
                if (string.IsNullOrEmpty(existingConnectionId))
                {
                    _logger?.LogWarning("ReloadConnectionsAsync: No connection ID provided and storage service doesn't have one set. Reload may fail. StorageService type: {Type}",
                        _storageService.GetType().FullName);
                }
                else
                {
                    _logger?.LogInformation("ReloadConnectionsAsync: Using existing connection ID from storage service: {ConnectionId}", existingConnectionId);
                }
            }
            else
            {
                _logger?.LogWarning("ReloadConnectionsAsync: Storage service is not VSCodeStorageService, type: {Type}",
                    _storageService.GetType().FullName);
            }

            _logger?.LogInformation("ReloadConnectionsAsync: Calling LoadConnectionsAsync on storage service...");
            var response = await _storageService.LoadConnectionsAsync();

            _logger?.LogInformation("ReloadConnectionsAsync: LoadConnectionsAsync completed. Success: {Success}, Error: {Error}, Data: {Data}",
                response.Success, response.Error ?? "(none)", response.Data != null ? $"{response.Data.Count} items" : "null");

            if (response.Success && response.Data != null)
            {
                lock (_cacheLock)
                {
                    var previousCount = _cachedConnections?.Count ?? 0;
                    var previousIds = _cachedConnections?.Select(c => c.Id ?? "(null)").ToList() ?? new List<string>();
                    _cachedConnections = response.Data;
                    var newIds = response.Data.Select(c => c.Id ?? "(null)").ToList();

                    _logger?.LogInformation("ReloadConnectionsAsync: Cache updated. Previous: {PreviousCount} items [{PreviousIds}], New: {NewCount} items [{NewIds}]",
                        previousCount, string.Join(", ", previousIds), response.Data.Count, string.Join(", ", newIds));
                }
            }
            else
            {
                // Log detailed information about why reload failed
                lock (_cacheLock)
                {
                    var cacheStateAfterFailure = _cachedConnections == null ? "null" :
                        _cachedConnections.Count == 0 ? "empty" : $"{_cachedConnections.Count} items";
                    _logger?.LogWarning("ReloadConnectionsAsync: Reload failed. Cache state after failure: {CacheState}", cacheStateAfterFailure);
                }

                if (!response.Success)
                {
                    if (response.Error?.Contains("No SignalR connection available") == true)
                    {
                        _logger?.LogWarning("ReloadConnectionsAsync: Cannot reload connections: No SignalR connection available. Storage service may not have connection ID set.");
                    }
                    else if (response.Error?.Contains("Client") == true)
                    {
                        _logger?.LogWarning("ReloadConnectionsAsync: Failed to reload connections: Client error. Error: {Error}, StorageService type: {Type}",
                            response.Error, _storageService.GetType().FullName);
                    }
                    else
                    {
                        _logger?.LogWarning("ReloadConnectionsAsync: Failed to reload connections from storage. Success: {Success}, Error: {Error}, Data: {Data}, StorageService type: {Type}",
                            response.Success, response.Error, response.Data != null ? $"{response.Data.Count} items" : "null",
                            _storageService.GetType().FullName);
                    }
                }
                else if (response.Data == null)
                {
                    _logger?.LogWarning("ReloadConnectionsAsync: Reload returned success but Data is null. This indicates a problem with the storage service response. StorageService type: {Type}",
                        _storageService.GetType().FullName);
                }
            }
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Error reloading connections from storage. Exception: {Exception}", ex);
        }
    }

    /// <summary>
    /// Get a connection configuration by ID, with automatic reload if not found.
    /// </summary>
    public async Task<ConnectionConfig?> GetConnectionConfigAsync(string connectionId)
    {
        if (_storageService == null)
        {
            // Fallback: create minimal config from connection ID
            return new ConnectionConfig
            {
                Id = connectionId,
                Server = connectionId
            };
        }

        // DIAGNOSTIC: Log cache state before access
        lock (_cacheLock)
        {
            var cacheState = _cachedConnections == null ? "null" :
                _cachedConnections.Count == 0 ? "empty" : $"{_cachedConnections.Count} items";
            var cacheIds = _cachedConnections?.Select(c => c.Id ?? "(null)").ToList() ?? new List<string>();
            _logger?.LogDebug("GetConnectionConfigAsync: Checking cache for ConnectionId: {ConnectionId}. Cache state: {CacheState}, Cache IDs: [{CacheIds}]",
                connectionId, cacheState, string.Join(", ", cacheIds));

            // Use case-insensitive comparison and trim whitespace to handle potential mismatches
            var connection = _cachedConnections?.FirstOrDefault(c =>
                string.Equals((c.Id ?? string.Empty).Trim(), (connectionId ?? string.Empty).Trim(), StringComparison.OrdinalIgnoreCase));
            if (connection != null)
            {
                _logger?.LogDebug("GetConnectionConfigAsync: Connection found in cache. ConnectionId: {ConnectionId}, MatchedId: {MatchedId}",
                    connectionId, connection.Id);
                return ConvertToConnectionConfig(connection);
            }
            else
            {
                _logger?.LogDebug("GetConnectionConfigAsync: Connection NOT found in cache. ConnectionId: {ConnectionId}, Cache has {Count} items",
                    connectionId, _cachedConnections?.Count ?? 0);
            }
        }

        // Connection not found in cache, try to reload and check again
        _logger?.LogWarning("Connection not found in cache. ConnectionId: {ConnectionId}. Attempting to reload connections...", connectionId);

        // Log current cache state before reload
        lock (_cacheLock)
        {
            if (_cachedConnections != null && _cachedConnections.Count > 0)
            {
                var cachedIds = _cachedConnections.Select(c => c.Id ?? "(null)").ToList();
                _logger?.LogWarning("Current cache contains {Count} connections with IDs: {Ids}",
                    _cachedConnections.Count,
                    string.Join(", ", cachedIds));
            }
            else
            {
                _logger?.LogWarning("Cache is empty or null before reload. This may be a timing issue - SignalR connection may not be established yet.");
            }
        }

        // Try to reload connections and check cache again
        // CRITICAL FIX: Do NOT pass the SQL connection config ID here - that would overwrite the SignalR connection ID
        // The SignalR connection ID should already be set from OnConnectedAsync in SqlHub
        // Only pass a connection ID parameter when it's a SignalR connection ID (from hub notifications)
        await ReloadConnectionsAsync();

        // Give a brief moment for the reload to complete and cache to be populated
        // This helps with timing issues where requests arrive before SignalR connection is fully established
        await Task.Delay(100);

        // Check cache again after reload
        lock (_cacheLock)
        {
            var cacheStateAfter = _cachedConnections == null ? "null" :
                _cachedConnections.Count == 0 ? "empty" : $"{_cachedConnections.Count} items";
            _logger?.LogInformation("GetConnectionConfigAsync: Cache state after reload: {CacheState}", cacheStateAfter);

            if (_cachedConnections != null && _cachedConnections.Count > 0)
            {
                var cachedIds = _cachedConnections.Select(c => c.Id ?? "(null)").ToList();
                _logger?.LogInformation("Cache after reload contains {Count} connections with IDs: {Ids}",
                    _cachedConnections.Count,
                    string.Join(", ", cachedIds));
            }
            else
            {
                _logger?.LogWarning("GetConnectionConfigAsync: Cache is still empty/null after reload. This indicates the reload failed or returned no data.");
            }

            // Use case-insensitive comparison and trim whitespace to handle potential mismatches
            var connection = _cachedConnections?.FirstOrDefault(c =>
                string.Equals((c.Id ?? string.Empty).Trim(), (connectionId ?? string.Empty).Trim(), StringComparison.OrdinalIgnoreCase));
            if (connection != null)
            {
                _logger?.LogInformation("Connection found in cache after reload. ConnectionId: {ConnectionId}, MatchedId: {MatchedId}",
                    connectionId, connection.Id);
                return ConvertToConnectionConfig(connection);
            }
            else
            {
                _logger?.LogWarning("GetConnectionConfigAsync: Connection still not found in cache after reload. ConnectionId: {ConnectionId}, Cache has {Count} items",
                    connectionId, _cachedConnections?.Count ?? 0);
            }
        }

        _logger?.LogWarning("Connection still not found in cache after reload. ConnectionId: {ConnectionId}. " +
            "This may indicate the connection doesn't exist in storage, or the SignalR connection hasn't been established yet. " +
            "Please ensure the VS Code extension is connected and the connection has been saved.", connectionId);
        return null;
    }

    /// <summary>
    /// Convert ConnectionConfigDto to ConnectionConfig.
    /// </summary>
    private static ConnectionConfig ConvertToConnectionConfig(ConnectionConfigDto dto)
    {
        return new ConnectionConfig
        {
            Id = dto.Id,
            Name = dto.Name,
            Server = dto.Server,
            Database = dto.Database,
            Username = dto.Username,
            Password = dto.Password,
            IntegratedSecurity = dto.IntegratedSecurity,
            Port = dto.Port
        };
    }
}

