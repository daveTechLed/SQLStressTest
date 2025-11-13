namespace SQLStressTest.Service.Models;

/// <summary>
/// Represents execution metrics for a query execution, including data size.
/// Sent alongside Extended Events data to provide complete execution information.
/// </summary>
public class ExecutionMetrics
{
    /// <summary>
    /// Execution number (1-based index)
    /// </summary>
    public int ExecutionNumber { get; set; }
    
    /// <summary>
    /// Execution ID (GUID from context_info)
    /// </summary>
    public Guid ExecutionId { get; set; }
    
    /// <summary>
    /// Data size in bytes for the result set
    /// </summary>
    public long DataSizeBytes { get; set; }
    
    /// <summary>
    /// Timestamp when metrics were captured
    /// </summary>
    public DateTime Timestamp { get; set; }
    
    /// <summary>
    /// Timestamp in milliseconds (Unix timestamp) for frontend compatibility
    /// </summary>
    public long TimestampMs { get; set; }
}

