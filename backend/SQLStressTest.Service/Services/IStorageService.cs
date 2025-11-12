using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Interface for storage operations that delegate to VS Code frontend
/// </summary>
public interface IStorageService
{
    Task<StorageResponse> SaveConnectionAsync(ConnectionConfigDto connection);
    Task<StorageResponse<List<ConnectionConfigDto>>> LoadConnectionsAsync();
    Task<StorageResponse> UpdateConnectionAsync(string id, ConnectionConfigDto connection);
    Task<StorageResponse> DeleteConnectionAsync(string id);
    
    Task<StorageResponse> SaveQueryResultAsync(QueryResultDto result);
    Task<StorageResponse<List<QueryResultDto>>> LoadQueryResultsAsync(string connectionId);
    
    Task<StorageResponse> SavePerformanceMetricsAsync(PerformanceMetricsDto metrics);
    Task<StorageResponse<List<PerformanceMetricsDto>>> LoadPerformanceMetricsAsync(string connectionId, TimeRangeDto timeRange);
}

