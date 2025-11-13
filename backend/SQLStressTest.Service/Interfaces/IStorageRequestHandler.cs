using Microsoft.AspNetCore.SignalR;
using SQLStressTest.Service.Models;
using SQLStressTest.Service.Services;

namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for storage request handler.
/// </summary>
public interface IStorageRequestHandler
{
    Task<StorageResponse> RequestSaveConnection(ISingleClientProxy caller, ConnectionConfigDto connection);
    Task<StorageResponse<List<ConnectionConfigDto>>> RequestLoadConnections(ISingleClientProxy caller);
    Task<StorageResponse> RequestUpdateConnection(ISingleClientProxy caller, string id, ConnectionConfigDto connection);
    Task<StorageResponse> RequestDeleteConnection(ISingleClientProxy caller, string id);
    Task<StorageResponse> RequestSaveQueryResult(ISingleClientProxy caller, QueryResultDto result);
    Task<StorageResponse<List<QueryResultDto>>> RequestLoadQueryResults(ISingleClientProxy caller, string connectionId);
    Task<StorageResponse> RequestSavePerformanceMetrics(ISingleClientProxy caller, PerformanceMetricsDto metrics);
    Task<StorageResponse<List<PerformanceMetricsDto>>> RequestLoadPerformanceMetrics(ISingleClientProxy caller, string connectionId, TimeRangeDto timeRange);
    Task HandleConnectionSavedNotification(string connectionId, string hubConnectionId, IConnectionCacheService connectionCacheService, IStorageService? storageService);
}

