using SQLStressTest.Service.Interfaces;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for setting context_info on SQL Server connections.
/// Single Responsibility: Context info setting only.
/// </summary>
public class ContextInfoSetter
{
    /// <summary>
    /// Sets the context_info on a SQL Server connection to a value that can be used for correlation.
    /// </summary>
    /// <param name="connection">The SQL connection wrapper</param>
    /// <param name="executionNumber">The execution number to encode in context_info</param>
    public async Task SetContextInfoAsync(
        ISqlConnectionWrapper connection,
        int executionNumber)
    {
        // Set context_info to "SQLSTRESSTEST_" + execution number for correlation
        var contextInfoString = $"SQLSTRESSTEST_{executionNumber}";
        var contextInfoBytes = System.Text.Encoding.UTF8.GetBytes(contextInfoString);
        
        // Pad to 128 bytes (context_info max size) with null bytes
        var paddedBytes = new byte[128];
        Array.Copy(contextInfoBytes, paddedBytes, contextInfoBytes.Length);
        
        // Convert to hex string format required by SQL Server
        var contextInfoHex = "0x" + string.Join("", paddedBytes.Select(b => b.ToString("X2")));
        var setContextInfoQuery = $"SET CONTEXT_INFO {contextInfoHex}";

        using var contextCommand = connection.CreateCommand(setContextInfoQuery);
        await contextCommand.ExecuteScalarAsync();
    }
}

