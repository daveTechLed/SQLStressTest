using Microsoft.AspNetCore.SignalR;

namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for heartbeat sender.
/// </summary>
public interface IHeartbeatSender
{
    Task SendHeartbeatAsync(IClientProxy client, string connectionId, string status);
}

