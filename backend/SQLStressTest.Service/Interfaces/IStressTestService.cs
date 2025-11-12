using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Interfaces;

public interface IStressTestService
{
    /// <summary>
    /// Execute a stress test with parallel query executions and Extended Events monitoring
    /// </summary>
    Task<StressTestResponse> ExecuteStressTestAsync(
        ConnectionConfig config,
        string query,
        int parallelExecutions,
        int totalExecutions,
        CancellationToken cancellationToken = default);
}

