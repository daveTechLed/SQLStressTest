namespace SQLStressTest.Service.Models;

/// <summary>
/// Performance data sent to SignalR clients
/// Matches TypeScript interface: { timestamp: number; cpuPercent: number }
/// </summary>
public class PerformanceData
{
    /// <summary>
    /// Unix timestamp in milliseconds
    /// </summary>
    public long Timestamp { get; set; }

    /// <summary>
    /// CPU usage percentage (0-100)
    /// </summary>
    public double CpuPercent { get; set; }
}

