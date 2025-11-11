using System.ComponentModel.DataAnnotations;

namespace SQLStressTest.Service.Models;

public class QueryRequest
{
    [Required(ErrorMessage = "ConnectionId is required")]
    public string ConnectionId { get; set; } = string.Empty;
    
    [Required(ErrorMessage = "Query is required")]
    public string Query { get; set; } = string.Empty;
}

