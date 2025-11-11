namespace SQLStressTest.Service.Models;

/// <summary>
/// Heartbeat message sent to SignalR clients to indicate connection status
/// Matches TypeScript interface: { timestamp: number; status: 'connected' | 'disconnected' }
/// </summary>
public class HeartbeatMessage
{
    /// <summary>
    /// Unix timestamp in milliseconds
    /// </summary>
    public long Timestamp { get; set; }

    /// <summary>
    /// Connection status: "connected" or "disconnected"
    /// </summary>
    public string Status { get; set; } = string.Empty;
}

