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
    private readonly ILogger<SqlController> _logger;
    private readonly QueryExecutionOrchestrator _queryExecutionOrchestrator;
    private readonly StressTestOrchestrator _stressTestOrchestrator;
    private readonly ConnectionCacheService _connectionCacheService;
    
    // Static reference for backward compatibility with SqlHub and ExtendedEventsService
    private static ConnectionCacheService? _staticConnectionCacheService;
    private static ILogger<SqlController>? _staticLogger;

    public SqlController(
        ISqlConnectionService sqlConnectionService,
        IConnectionStringBuilder connectionStringBuilder,
        ILogger<SqlController> logger,
        IStressTestService stressTestService,
        IStorageService? storageService = null,
        ConnectionCacheService? connectionCacheService = null,
        QueryExecutionOrchestrator? queryExecutionOrchestrator = null,
        StressTestOrchestrator? stressTestOrchestrator = null)
    {
        _sqlConnectionService = sqlConnectionService ?? throw new ArgumentNullException(nameof(sqlConnectionService));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        
        // Create loggers for services
        ILogger<ConnectionCacheService>? cacheLogger = null;
        ILogger<QueryRequestValidator>? validatorLogger = null;
        ILogger<QueryExecutionOrchestrator>? queryOrchestratorLogger = null;
        ILogger<StressTestOrchestrator>? stressOrchestratorLogger = null;
        if (logger != null)
        {
            var loggerFactory = Microsoft.Extensions.Logging.LoggerFactory.Create(builder => builder.AddConsole());
            cacheLogger = loggerFactory.CreateLogger<ConnectionCacheService>();
            validatorLogger = loggerFactory.CreateLogger<QueryRequestValidator>();
            queryOrchestratorLogger = loggerFactory.CreateLogger<QueryExecutionOrchestrator>();
            stressOrchestratorLogger = loggerFactory.CreateLogger<StressTestOrchestrator>();
        }
        
        // Create ConnectionCacheService if not provided
        _connectionCacheService = connectionCacheService ?? new ConnectionCacheService(storageService, cacheLogger);
        _staticConnectionCacheService = _connectionCacheService;
        _staticLogger = logger;
        
        // Create orchestrators if not provided
        var requestValidator = queryExecutionOrchestrator == null && stressTestOrchestrator == null 
            ? new QueryRequestValidator(validatorLogger)
            : null;
        _queryExecutionOrchestrator = queryExecutionOrchestrator ?? new QueryExecutionOrchestrator(
            sqlConnectionService,
            _connectionCacheService,
            requestValidator ?? new QueryRequestValidator(validatorLogger),
            queryOrchestratorLogger ?? throw new InvalidOperationException("Logger required"));
        _stressTestOrchestrator = stressTestOrchestrator ?? new StressTestOrchestrator(
            stressTestService,
            _connectionCacheService,
            requestValidator ?? new QueryRequestValidator(validatorLogger),
            stressOrchestratorLogger ?? throw new InvalidOperationException("Logger required"));
        
        // Load connections on first request (lazy loading)
        if (storageService != null)
        {
            _logger.LogDebug("SqlController constructor: Triggering lazy load of connections");
            _ = Task.Run(async () => await _connectionCacheService.LoadConnectionsAsync());
        }
        else
        {
            lock (_connectionCacheService.GetCacheLock())
            {
                var cached = _connectionCacheService.GetCachedConnections();
                var cacheState = cached == null ? "null" : 
                    cached.Count == 0 ? "empty" : $"{cached.Count} items";
                _logger.LogDebug("SqlController constructor: Skipping lazy load. Cache state: {CacheState}, StorageService: {StorageServiceState}", 
                    cacheState, storageService == null ? "null" : "available");
            }
        }
    }

    /// <summary>
    /// Public method to reload connections from storage. Can be called from hub when frontend notifies of a save.
    /// </summary>
    public async Task ReloadConnectionsAsync()
    {
        await _connectionCacheService.LoadConnectionsAsync();
    }

    /// <summary>
    /// Static method to trigger connection reload. Can be called from hub without controller instance.
    /// Maintained for backward compatibility with SqlHub.
    /// </summary>
    /// <param name="storageService">The storage service to use for loading connections. Required - uses proper DI instead of static field.</param>
    /// <param name="connectionId">Optional SignalR connection ID to use for the reload. If provided, sets this on the storage service before reloading.
    /// WARNING: This must be a SignalR connection ID (e.g., from Context.ConnectionId), NOT a SQL connection config ID.
    /// If null, uses the connection ID already set on the storage service from OnConnectedAsync.</param>
    public static async Task ReloadConnectionsStaticAsync(IStorageService storageService, string? connectionId = null)
    {
        if (_staticConnectionCacheService == null)
        {
            _staticLogger?.LogError("ReloadConnectionsStaticAsync: ConnectionCacheService not initialized. Cannot reload.");
            return;
        }
        
        await _staticConnectionCacheService.ReloadConnectionsAsync(connectionId);
    }

    /// <summary>
    /// Get the cache lock object for thread-safe access to cached connections.
    /// Used by hub to access cache for verification.
    /// Maintained for backward compatibility with SqlHub and ExtendedEventsService.
    /// </summary>
    public static object GetCacheLock()
    {
        return _staticConnectionCacheService?.GetCacheLock() ?? new object();
    }

    /// <summary>
    /// Get the cached connections list (thread-safe access required via GetCacheLock).
    /// Used by hub to verify connections after save.
    /// Maintained for backward compatibility with SqlHub and ExtendedEventsService.
    /// </summary>
    public static List<ConnectionConfigDto>? GetCachedConnections()
    {
        return _staticConnectionCacheService?.GetCachedConnections();
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
        return await _queryExecutionOrchestrator.ExecuteQueryAsync(request, ModelState);
    }

    [HttpPost("stress-test")]
    public async Task<IActionResult> ExecuteStressTest([FromBody] StressTestRequest request)
    {
        return await _stressTestOrchestrator.ExecuteStressTestAsync(request, ModelState);
    }
}

