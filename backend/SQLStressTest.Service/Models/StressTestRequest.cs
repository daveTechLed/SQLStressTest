using System.ComponentModel.DataAnnotations;

namespace SQLStressTest.Service.Models;

public class StressTestRequest
{
    [Required(ErrorMessage = "ConnectionId is required", AllowEmptyStrings = false)]
    public string ConnectionId { get; set; } = string.Empty;
    
    [Required(ErrorMessage = "Query is required", AllowEmptyStrings = false)]
    public string Query { get; set; } = string.Empty;
    
    [Range(1, 1000, ErrorMessage = "ParallelExecutions must be between 1 and 1000")]
    public int ParallelExecutions { get; set; } = 1;
    
    [Range(1, 100000, ErrorMessage = "TotalExecutions must be between 1 and 100000")]
    public int TotalExecutions { get; set; } = 1;
    
    /// <summary>
    /// Optional database name to override the connection's default database.
    /// If provided, queries will be executed in this database context.
    /// </summary>
    public string? Database { get; set; }
}

