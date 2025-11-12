namespace SQLStressTest.Service.Models;

/// <summary>
/// Request to save a query execution result
/// </summary>
public class SaveQueryResultRequest
{
    /// <summary>
    /// Query result to save
    /// </summary>
    public QueryResultDto Result { get; set; } = new();
}

/// <summary>
/// Request to load query results for a connection
/// </summary>
public class LoadQueryResultsRequest
{
    /// <summary>
    /// Connection ID to load results for
    /// </summary>
    public string ConnectionId { get; set; } = string.Empty;
}

/// <summary>
/// Query execution result DTO
/// </summary>
public class QueryResultDto
{
    public string Id { get; set; } = string.Empty;
    public string ConnectionId { get; set; } = string.Empty;
    public string Query { get; set; } = string.Empty;
    public long ExecutionTimeMs { get; set; }
    public DateTime ExecutedAt { get; set; }
    public bool Success { get; set; }
    public string? ErrorMessage { get; set; }
    public int? RowsAffected { get; set; }
    public string? ResultData { get; set; } // JSON serialized result data
}

