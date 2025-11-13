using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Interfaces;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for handling storage of query results.
/// Single Responsibility: Storage operations only.
/// </summary>
public class QueryResultStorageHandler
{
    private readonly IStorageService? _storageService;
    private readonly ILogger<QueryResultStorageHandler>? _logger;

    public QueryResultStorageHandler(
        IStorageService? storageService = null,
        ILogger<QueryResultStorageHandler>? logger = null)
    {
        _storageService = storageService;
        _logger = logger;
    }

    /// <summary>
    /// Saves query result to storage asynchronously (fire and forget).
    /// </summary>
    public void SaveQueryResultAsync(
        ConnectionConfig config,
        string query,
        QueryResponse response,
        string? resultDataJson)
    {
        // Save query result to storage (fire and forget - don't block response)
        if (_storageService != null && config != null)
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    var resultDto = new QueryResultDto
                    {
                        Id = Guid.NewGuid().ToString(),
                        ConnectionId = config.Id ?? string.Empty,
                        Query = query,
                        ExecutionTimeMs = response.ExecutionTimeMs ?? 0,
                        ExecutedAt = DateTime.UtcNow,
                        Success = response.Success,
                        ErrorMessage = response.Error,
                        RowsAffected = response.Success && response.RowCount.HasValue ? response.RowCount.Value : null,
                        ResultData = resultDataJson
                    };

                    var saveResponse = await _storageService.SaveQueryResultAsync(resultDto);
                    if (!saveResponse.Success)
                    {
                        _logger?.LogWarning("Failed to save query result to storage. Error: {Error}", saveResponse.Error);
                    }
                    else
                    {
                        _logger?.LogDebug("Query result saved to storage. QueryId: {QueryId}, ConnectionId: {ConnectionId}", 
                            resultDto.Id, resultDto.ConnectionId);
                    }
                }
                catch (Exception ex)
                {
                    _logger?.LogError(ex, "Error saving query result to storage");
                }
            });
        }
    }
}

