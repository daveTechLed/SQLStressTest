using System.ComponentModel.DataAnnotations;

namespace SQLStressTest.Service.Models;

public class QueryRequest
{
    [Required(ErrorMessage = "ConnectionId is required", AllowEmptyStrings = false)]
    public string ConnectionId { get; set; } = string.Empty;
    
    [Required(ErrorMessage = "Query is required", AllowEmptyStrings = false)]
    public string Query { get; set; } = string.Empty;
    
    /// <summary>
    /// Optional database name to override the connection's default database.
    /// If provided, queries will be executed in this database context.
    /// </summary>
    public string? Database { get; set; }
}

