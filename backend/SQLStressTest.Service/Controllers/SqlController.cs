using Microsoft.AspNetCore.Mvc;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;
using SQLStressTest.Service.Services;

namespace SQLStressTest.Service.Controllers;

[ApiController]
[Route("api/[controller]")]
public class SqlController : ControllerBase
{
    private readonly ISqlConnectionService _sqlConnectionService;
    private readonly IConnectionStringBuilder _connectionStringBuilder;
    private readonly ILogger<SqlController> _logger;
    private readonly IStorageService? _storageService;
    private readonly IStressTestService _stressTestService;
    private static List<ConnectionConfigDto>? _cachedConnections;
    private static readonly object _cacheLock = new();
    private static IStorageService? _staticStorageService;
    private static ILogger<SqlController>? _staticLogger;

    public SqlController(
        ISqlConnectionService sqlConnectionService,
        IConnectionStringBuilder connectionStringBuilder,
        ILogger<SqlController> logger,
        IStressTestService stressTestService,
        IStorageService? storageService = null)
    {
        _sqlConnectionService = sqlConnectionService ?? throw new ArgumentNullException(nameof(sqlConnectionService));
        _connectionStringBuilder = connectionStringBuilder ?? throw new ArgumentNullException(nameof(connectionStringBuilder));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _stressTestService = stressTestService ?? throw new ArgumentNullException(nameof(stressTestService));
        _storageService = storageService;
        
        // Store static references for reload capability from hub
        _staticStorageService = storageService;
        _staticLogger = logger;
        
        // Load connections on first request (lazy loading)
        if (_storageService != null && _cachedConnections == null)
        {
            _ = Task.Run(async () => await LoadConnectionsAsync());
        }
    }

    private async Task LoadConnectionsAsync()
    {
        if (_storageService == null) return;
        
        try
        {
            var response = await _storageService.LoadConnectionsAsync();
            if (response.Success && response.Data != null)
            {
                lock (_cacheLock)
                {
                    _cachedConnections = response.Data;
                }
                _logger.LogInformation("Loaded {Count} connections from storage", response.Data.Count);
            }
            else if (!response.Success)
            {
                // Only log as ERROR if it's an unexpected failure
                // "No SignalR connection available" is expected when no client is connected
                if (response.Error?.Contains("No SignalR connection available") == true)
                {
                    _logger.LogDebug("Cannot load connections: No SignalR connection (expected when no client connected)");
                }
                else
                {
                    _logger.LogWarning("Failed to load connections from storage. Error: {Error}", response.Error);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading connections from storage");
        }
    }

    /// <summary>
    /// Public method to reload connections from storage. Can be called from hub when frontend notifies of a save.
    /// </summary>
    public async Task ReloadConnectionsAsync()
    {
        await LoadConnectionsAsync();
    }

    /// <summary>
    /// Static method to trigger connection reload. Can be called from hub without controller instance.
    /// </summary>
    /// <param name="connectionId">Optional connection ID to use for the reload. If provided, sets this on the storage service before reloading.</param>
    public static async Task ReloadConnectionsStaticAsync(string? connectionId = null)
    {
        if (_staticStorageService == null) return;
        
        try
        {
            _staticLogger?.LogInformation("ReloadConnectionsStaticAsync: Starting reload from storage");
            
            // CRITICAL FIX: If a connection ID is provided, set it on the storage service before reloading
            // This ensures we use the correct connection ID (the one that notified us of the save)
            // rather than relying on a potentially stale connection ID
            if (!string.IsNullOrEmpty(connectionId) && _staticStorageService is VSCodeStorageService vscodeStorage)
            {
                vscodeStorage.SetConnectionId(connectionId);
                _staticLogger?.LogDebug("Storage service connection ID set to {ConnectionId} for reload", connectionId);
            }
            
            var response = await _staticStorageService.LoadConnectionsAsync();
            if (response.Success && response.Data != null)
            {
                lock (_cacheLock)
                {
                    _cachedConnections = response.Data;
                }
                _staticLogger?.LogInformation("Reloaded {Count} connections from storage (triggered by notification)", response.Data.Count);
                _staticLogger?.LogInformation("Connection IDs after reload: {Ids}", 
                    string.Join(", ", response.Data.Select(c => c.Id)));
            }
            else if (!response.Success)
            {
                if (response.Error?.Contains("No SignalR connection available") == true)
                {
                    _staticLogger?.LogDebug("Cannot reload connections: No SignalR connection");
                }
                else
                {
                    _staticLogger?.LogWarning("Failed to reload connections from storage. Error: {Error}", response.Error);
                }
            }
        }
        catch (Exception ex)
        {
            _staticLogger?.LogError(ex, "Error reloading connections from storage. Exception: {Exception}", ex);
        }
    }

    /// <summary>
    /// Get the cache lock object for thread-safe access to cached connections.
    /// Used by hub to access cache for verification.
    /// </summary>
    public static object GetCacheLock()
    {
        return _cacheLock;
    }

    /// <summary>
    /// Get the cached connections list (thread-safe access required via GetCacheLock).
    /// Used by hub to verify connections after save.
    /// </summary>
    public static List<ConnectionConfigDto>? GetCachedConnections()
    {
        return _cachedConnections;
    }

    private ConnectionConfig? GetConnectionConfig(string connectionId)
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

        lock (_cacheLock)
        {
            var connection = _cachedConnections?.FirstOrDefault(c => c.Id == connectionId);
            if (connection != null)
            {
                return new ConnectionConfig
                {
                    Id = connection.Id,
                    Name = connection.Name,
                    Server = connection.Server,
                    Database = connection.Database,
                    Username = connection.Username,
                    Password = connection.Password,
                    IntegratedSecurity = connection.IntegratedSecurity,
                    Port = connection.Port
                };
            }
        }

        // Connection not found in cache, try to reload
        _ = Task.Run(async () => await LoadConnectionsAsync());
        
        _logger.LogWarning("Connection not found in cache. ConnectionId: {ConnectionId}", connectionId);
        return null;
    }

    [HttpPost("test")]
    public async Task<IActionResult> TestConnection([FromBody] ConnectionConfig config)
    {
        if (config == null)
        {
            _logger.LogWarning("TestConnection validation failed: Connection configuration is null. Request path: {Path}, Method: {Method}",
                Request?.Path.ToString(), Request?.Method);
            
            var errorResponse = new TestConnectionResponse 
            { 
                Success = false, 
                Error = "Connection configuration is required" 
            };
            return BadRequest(errorResponse);
        }

        try
        {
            // Use enhanced test connection that returns detailed information
            var response = await _sqlConnectionService.TestConnectionWithDetailsAsync(config);
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "TestConnection failed with exception. Server: {Server}, Name: {Name}",
                config?.Server, config?.Name);
            
            var errorResponse = new TestConnectionResponse 
            { 
                Success = false, 
                Error = ex.Message 
            };
            return Ok(errorResponse);
        }
    }

    [HttpPost("execute")]
    public async Task<IActionResult> ExecuteQuery([FromBody] QueryRequest request)
    {
        // Check for null request first (before accessing Request properties that might be null in tests)
        if (request == null)
        {
            _logger.LogWarning("ExecuteQuery validation failed: Request is null. Request path: {Path}, Method: {Method}, Content-Type: {ContentType}, Content-Length: {ContentLength}",
                Request?.Path.ToString(), Request?.Method, Request?.ContentType, Request?.ContentLength);
            
            var errorResponse = new QueryResponse
            {
                Success = false,
                Error = "Request is required"
            };
            return BadRequest(errorResponse);
        }

        // Log model binding state and validation errors
        if (!ModelState.IsValid)
        {
            var modelErrors = string.Join(", ", ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage ?? "Unknown error"));
            
            var errorDetails = ModelState
                .Where(ms => ms.Value?.Errors?.Any() == true)
                .Select(ms => $"{ms.Key}: {string.Join(", ", ms.Value!.Errors!.Select(e => e.ErrorMessage ?? "Unknown error"))}")
                .ToList();
            
            _logger.LogWarning("ExecuteQuery model validation failed. Errors: {Errors}, Error details: {ErrorDetails}, Request path: {Path}, Method: {Method}, Content-Type: {ContentType}, Content-Length: {ContentLength}",
                modelErrors, 
                string.Join("; ", errorDetails),
                Request?.Path.ToString(), 
                Request?.Method,
                Request?.ContentType,
                Request?.ContentLength);
            
            // Return validation errors as 400 Bad Request
            var errorResponse = new QueryResponse
            {
                Success = false,
                Error = $"Validation failed: {modelErrors}"
            };
            return BadRequest(errorResponse);
        }

        // Log request details for debugging (sanitized - don't log full query if it's very long)
        var queryPreview = request.Query?.Length > 100 
            ? request.Query.Substring(0, 100) + "..." 
            : request.Query;
        
        _logger.LogDebug("ExecuteQuery received request. ConnectionId: {ConnectionId}, Query length: {QueryLength}, Query preview: {QueryPreview}",
            request.ConnectionId, request.Query?.Length ?? 0, queryPreview);

        if (string.IsNullOrWhiteSpace(request.ConnectionId))
        {
            _logger.LogWarning("ExecuteQuery validation failed: ConnectionId is null or empty. Request details - Query length: {QueryLength}, Query preview: {QueryPreview}",
                request.Query?.Length ?? 0, queryPreview);
            
            var errorResponse = new QueryResponse
            {
                Success = false,
                Error = "ConnectionId is required"
            };
            return BadRequest(errorResponse);
        }

        if (string.IsNullOrWhiteSpace(request.Query))
        {
            _logger.LogWarning("ExecuteQuery validation failed: Query is null or empty. Request details - ConnectionId: {ConnectionId}",
                request.ConnectionId);
            
            var errorResponse = new QueryResponse
            {
                Success = false,
                Error = "Query is required"
            };
            return BadRequest(errorResponse);
        }

        // Retrieve connection config from storage
        var connectionConfig = GetConnectionConfig(request.ConnectionId);
        if (connectionConfig == null)
        {
            _logger.LogWarning("ExecuteQuery failed: Connection not found. ConnectionId: {ConnectionId}", request.ConnectionId);
            var errorResponse = new QueryResponse
            {
                Success = false,
                Error = $"Connection '{request.ConnectionId}' not found"
            };
            return BadRequest(errorResponse);
        }

        try
        {
            var response = await _sqlConnectionService.ExecuteQueryAsync(connectionConfig, request.Query);
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "ExecuteQuery failed with exception. ConnectionId: {ConnectionId}, Query length: {QueryLength}",
                request.ConnectionId, request.Query?.Length ?? 0);
            
            var errorResponse = new QueryResponse
            {
                Success = false,
                Error = ex.Message
            };
            return Ok(errorResponse);
        }
    }

    [HttpPost("stress-test")]
    public async Task<IActionResult> ExecuteStressTest([FromBody] StressTestRequest request)
    {
        // Check for null request first
        if (request == null)
        {
            _logger.LogWarning("ExecuteStressTest validation failed: Request is null");
            var errorResponse = new StressTestResponse
            {
                Success = false,
                Error = "Request is required"
            };
            return BadRequest(errorResponse);
        }

        // Validate model state
        if (!ModelState.IsValid)
        {
            var modelErrors = string.Join(", ", ModelState.Values
                .SelectMany(v => v.Errors)
                .Select(e => e.ErrorMessage ?? "Unknown error"));
            
            _logger.LogWarning("ExecuteStressTest model validation failed. Errors: {Errors}", modelErrors);
            
            var errorResponse = new StressTestResponse
            {
                Success = false,
                Error = $"Validation failed: {modelErrors}"
            };
            return BadRequest(errorResponse);
        }

        _logger.LogInformation("ExecuteStressTest received request. ConnectionId: {ConnectionId}, ParallelExecutions: {ParallelExecutions}, TotalExecutions: {TotalExecutions}",
            request.ConnectionId, request.ParallelExecutions, request.TotalExecutions);

        if (string.IsNullOrWhiteSpace(request.ConnectionId))
        {
            _logger.LogWarning("ExecuteStressTest validation failed: ConnectionId is null or empty");
            var errorResponse = new StressTestResponse
            {
                Success = false,
                Error = "ConnectionId is required"
            };
            return BadRequest(errorResponse);
        }

        if (string.IsNullOrWhiteSpace(request.Query))
        {
            _logger.LogWarning("ExecuteStressTest validation failed: Query is null or empty");
            var errorResponse = new StressTestResponse
            {
                Success = false,
                Error = "Query is required"
            };
            return BadRequest(errorResponse);
        }

        // Retrieve connection config from storage
        var connectionConfig = GetConnectionConfig(request.ConnectionId);
        if (connectionConfig == null)
        {
            _logger.LogWarning("ExecuteStressTest failed: Connection not found. ConnectionId: {ConnectionId}", request.ConnectionId);
            var errorResponse = new StressTestResponse
            {
                Success = false,
                Error = $"Connection '{request.ConnectionId}' not found"
            };
            return BadRequest(errorResponse);
        }

        try
        {
            var response = await _stressTestService.ExecuteStressTestAsync(
                connectionConfig,
                request.Query,
                request.ParallelExecutions,
                request.TotalExecutions);
            
            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "ExecuteStressTest failed with exception. ConnectionId: {ConnectionId}",
                request.ConnectionId);
            
            var errorResponse = new StressTestResponse
            {
                Success = false,
                Error = ex.Message
            };
            return Ok(errorResponse);
        }
    }
}

