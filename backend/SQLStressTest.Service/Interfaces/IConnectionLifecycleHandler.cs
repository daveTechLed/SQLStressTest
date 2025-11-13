using Microsoft.AspNetCore.SignalR;
using SQLStressTest.Service.Hubs;

namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for connection lifecycle handler.
/// </summary>
public interface IConnectionLifecycleHandler
{
    Task HandleConnectedAsync(HubCallerContext context, IClientProxy caller);
    Task HandleDisconnectedAsync(HubCallerContext context, Exception? exception);
    IConnectionCacheService GetConnectionCacheService();
}

