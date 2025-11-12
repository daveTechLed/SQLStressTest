namespace SQLStressTest.Service.Models;

public class TestConnectionResponse
{
    public bool Success { get; set; }
    public string? Error { get; set; }
    public string? ServerVersion { get; set; }
    public string? AuthenticatedUser { get; set; }
    public List<string>? Databases { get; set; }
    public string? ServerName { get; set; }
}

