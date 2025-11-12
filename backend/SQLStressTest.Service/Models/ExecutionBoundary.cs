namespace SQLStressTest.Service.Models;

/// <summary>
/// Represents the boundary (start/end) of a query execution in a stress test.
/// Used to draw vertical lines on graphs to separate different executions.
/// </summary>
public class ExecutionBoundary
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
    /// Start time of the execution
    /// </summary>
    public DateTime StartTime { get; set; }
    
    /// <summary>
    /// End time of the execution (null if still running)
    /// </summary>
    public DateTime? EndTime { get; set; }
    
    /// <summary>
    /// Whether this is a start boundary (true) or end boundary (false)
    /// </summary>
    public bool IsStart { get; set; }
    
    /// <summary>
    /// Timestamp in milliseconds (Unix timestamp) for frontend compatibility
    /// </summary>
    public long TimestampMs { get; set; }
}

