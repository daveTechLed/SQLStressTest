namespace SQLStressTest.Service.Models;

/// <summary>
/// Request to save performance metrics
/// </summary>
public class SavePerformanceMetricsRequest
{
    /// <summary>
    /// Performance metrics to save
    /// </summary>
    public PerformanceMetricsDto Metrics { get; set; } = new();
}

/// <summary>
/// Request to load performance metrics for a connection
/// </summary>
public class LoadPerformanceMetricsRequest
{
    /// <summary>
    /// Connection ID to load metrics for
    /// </summary>
    public string ConnectionId { get; set; } = string.Empty;

    /// <summary>
    /// Time range for metrics
    /// </summary>
    public TimeRangeDto TimeRange { get; set; } = new();
}

/// <summary>
/// Performance metrics DTO
/// </summary>
public class PerformanceMetricsDto
{
    public string Id { get; set; } = string.Empty;
    public string ConnectionId { get; set; } = string.Empty;
    public DateTime Timestamp { get; set; }
    public double CpuPercent { get; set; }
    public long MemoryBytes { get; set; }
    public int ActiveConnections { get; set; }
    public long QueryExecutionTimeMs { get; set; }
}

/// <summary>
/// Time range DTO for filtering metrics
/// </summary>
public class TimeRangeDto
{
    public DateTime? StartTime { get; set; }
    public DateTime? EndTime { get; set; }
}

