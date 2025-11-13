using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.Logging;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for sending heartbeat messages to SignalR clients.
/// Single Responsibility: Heartbeat messaging only.
/// </summary>
public class HeartbeatSender
{
    private readonly ILogger<HeartbeatSender>? _logger;

    public HeartbeatSender(ILogger<HeartbeatSender>? logger = null)
    {
        _logger = logger;
    }

    /// <summary>
    /// Sends a heartbeat message to a SignalR client.
    /// </summary>
    /// <param name="client">The SignalR client proxy</param>
    /// <param name="connectionId">The connection ID for logging</param>
    /// <param name="status">The status to send ("connected" or "disconnected")</param>
    public async Task SendHeartbeatAsync(IClientProxy client, string connectionId, string status)
    {
        // Use strongly-typed DTO to enable source-generated serialization (no reflection needed)
        var heartbeat = new HeartbeatMessage
        {
            Timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            Status = status
        };

        _logger?.LogInformation("Sending heartbeat to connection {ConnectionId}. Timestamp: {Timestamp}, Status: {Status}",
            connectionId,
            heartbeat.Timestamp,
            heartbeat.Status);

        // Log the actual object being sent
        _logger?.LogDebug("Heartbeat object details: Type={Type}, Assembly={Assembly}, IsValueType={IsValueType}, IsPrimitive={IsPrimitive}",
            heartbeat.GetType(),
            heartbeat.GetType().Assembly.FullName,
            heartbeat.GetType().IsValueType,
            heartbeat.GetType().IsPrimitive);

        try
        {
            await client.SendAsync("Heartbeat", heartbeat);
            _logger?.LogInformation("Heartbeat sent successfully to connection {ConnectionId}", connectionId);
        }
        catch (Exception ex)
        {
            _logger?.LogError(ex, "Failed to send heartbeat to connection {ConnectionId}. Heartbeat type: {Type}, Exception type: {ExceptionType}",
                connectionId,
                heartbeat.GetType().FullName,
                ex.GetType().FullName);
            throw;
        }
    }
}

