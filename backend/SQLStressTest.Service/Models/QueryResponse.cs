namespace SQLStressTest.Service.Models;

public class QueryResponse
{
    public bool Success { get; set; }
    public List<string>? Columns { get; set; }
    public List<List<object?>>? Rows { get; set; }
    public int? RowCount { get; set; }
    public long? ExecutionTimeMs { get; set; }
    public string? Error { get; set; }
}

