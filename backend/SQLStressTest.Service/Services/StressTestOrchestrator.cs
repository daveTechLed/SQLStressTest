using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for orchestrating stress test execution requests.
/// Single Responsibility: Stress test execution orchestration only.
/// </summary>
public class StressTestOrchestrator : IStressTestOrchestrator
{
    private readonly IStressTestService _stressTestService;
    private readonly IConnectionCacheService _connectionCacheService;
    private readonly IQueryRequestValidator _requestValidator;
    private readonly ILogger<StressTestOrchestrator> _logger;

    public StressTestOrchestrator(
        IStressTestService stressTestService,
        IConnectionCacheService connectionCacheService,
        IQueryRequestValidator requestValidator,
        ILogger<StressTestOrchestrator> logger)
    {
        _stressTestService = stressTestService ?? throw new ArgumentNullException(nameof(stressTestService));
        _connectionCacheService = connectionCacheService ?? throw new ArgumentNullException(nameof(connectionCacheService));
        _requestValidator = requestValidator ?? throw new ArgumentNullException(nameof(requestValidator));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    /// <summary>
    /// Executes a stress test request, handling validation, connection retrieval, and execution.
    /// </summary>
    public async Task<IActionResult> ExecuteStressTestAsync(
        StressTestRequest? request,
        Microsoft.AspNetCore.Mvc.ModelBinding.ModelStateDictionary? modelState = null)
    {
        // Validate request
        var validationResult = _requestValidator.ValidateStressTestRequest(request, modelState);
        if (!validationResult.IsValid)
        {
            var errorResponse = new StressTestResponse
            {
                Success = false,
                Error = validationResult.ErrorMessage ?? "Validation failed"
            };
            return new BadRequestObjectResult(errorResponse);
        }

        _logger.LogInformation("ExecuteStressTest received request. ConnectionId: {ConnectionId}, ParallelExecutions: {ParallelExecutions}, TotalExecutions: {TotalExecutions}",
            request!.ConnectionId, request.ParallelExecutions, request.TotalExecutions);

        // Retrieve connection config from cache
        var connectionConfig = await _connectionCacheService.GetConnectionConfigAsync(request.ConnectionId);
        if (connectionConfig == null)
        {
            _logger.LogWarning("ExecuteStressTest failed: Connection not found. ConnectionId: {ConnectionId}", request.ConnectionId);
            var errorResponse = new StressTestResponse
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
                _logger.LogDebug("ExecuteStressTest: Using database from request: {Database}", request.Database);
            }

            var response = await _stressTestService.ExecuteStressTestAsync(
                connectionConfig,
                request.Query,
                request.ParallelExecutions,
                request.TotalExecutions);

            return new OkObjectResult(response);
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
            return new OkObjectResult(errorResponse);
        }
    }
}

