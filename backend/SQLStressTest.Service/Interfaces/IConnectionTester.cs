using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for connection tester.
/// </summary>
public interface IConnectionTester
{
    Task<bool> TestConnectionAsync(ConnectionConfig config);
    Task<TestConnectionResponse> TestConnectionWithDetailsAsync(ConnectionConfig config);
}

