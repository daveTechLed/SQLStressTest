namespace SQLStressTest.Service.Models;

public class StressTestResponse
{
    public bool Success { get; set; }
    public string? TestId { get; set; }
    public string? Error { get; set; }
    public string? Message { get; set; }
}

