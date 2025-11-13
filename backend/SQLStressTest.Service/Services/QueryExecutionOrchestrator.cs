using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for orchestrating query execution requests.
/// Single Responsibility: Query execution orchestration only.
/// </summary>
public class QueryExecutionOrchestrator
{
    private readonly ISqlConnectionService _sqlConnectionService;
    private readonly ConnectionCacheService _connectionCacheService;
    private readonly QueryRequestValidator _requestValidator;
    private readonly ILogger<QueryExecutionOrchestrator> _logger;

    public QueryExecutionOrchestrator(
        ISqlConnectionService sqlConnectionService,
        ConnectionCacheService connectionCacheService,
        QueryRequestValidator requestValidator,
        ILogger<QueryExecutionOrchestrator> logger)
    {
        _sqlConnectionService = sqlConnectionService ?? throw new ArgumentNullException(nameof(sqlConnectionService));
        _connectionCacheService = connectionCacheService ?? throw new ArgumentNullException(nameof(connectionCacheService));
        _requestValidator = requestValidator ?? throw new ArgumentNullException(nameof(requestValidator));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Executes a query request, handling validation, connection retrieval, and execution.
    /// </summary>
    public async Task<IActionResult> ExecuteQueryAsync(
        QueryRequest? request,
        Microsoft.AspNetCore.Mvc.ModelBinding.ModelStateDictionary? modelState = null)
    {
        // Validate request
        var validationResult = _requestValidator.ValidateQueryRequest(request, modelState);
        if (!validationResult.IsValid)
        {
            var errorResponse = new QueryResponse
            {
                Success = false,
                Error = validationResult.ErrorMessage ?? "Validation failed"
            };
            return new BadRequestObjectResult(errorResponse);
        }

        // Retrieve connection config from cache
        var connectionConfig = await _connectionCacheService.GetConnectionConfigAsync(request!.ConnectionId);
        if (connectionConfig == null)
        {
            _logger.LogWarning("ExecuteQuery failed: Connection not found. ConnectionId: {ConnectionId}", request.ConnectionId);
            var errorResponse = new QueryResponse
            {
                Success = false,
                Error = $"Connection '{request.ConnectionId}' not found"
            };
            return new BadRequestObjectResult(errorResponse);
        }

        try
        {
            // Override database if provided in request
            if (!string.IsNullOrEmpty(request.Database))
            {
                connectionConfig.Database = request.Database;
                _logger.LogDebug("ExecuteQuery: Using database from request: {Database}", request.Database);
            }

            var response = await _sqlConnectionService.ExecuteQueryAsync(connectionConfig, request.Query);
            return new OkObjectResult(response);
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
            return new OkObjectResult(errorResponse);
        }
    }
}

