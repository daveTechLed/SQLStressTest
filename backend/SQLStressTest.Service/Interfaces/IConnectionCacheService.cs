using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for connection cache service.
/// </summary>
public interface IConnectionCacheService
{
    object GetCacheLock();
    List<ConnectionConfigDto>? GetCachedConnections();
    Task LoadConnectionsAsync();
    Task ReloadConnectionsAsync(string? connectionId = null);
    Task<ConnectionConfig?> GetConnectionConfigAsync(string connectionId);
}

