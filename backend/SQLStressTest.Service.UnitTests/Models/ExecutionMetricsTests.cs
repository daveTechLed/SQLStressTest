using SQLStressTest.Service.Models;
using Xunit;

namespace SQLStressTest.Service.Tests.Models;

public class ExecutionMetricsTests
{
    [Fact]
    public void Constructor_InitializesProperties()
    {
        // Arrange
        var executionId = Guid.NewGuid();
        var timestamp = DateTime.UtcNow;
        var timestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var dataSizeBytes = 1024L;

        // Act
        var metrics = new ExecutionMetrics
        {
            ExecutionNumber = 1,
            ExecutionId = executionId,
            DataSizeBytes = dataSizeBytes,
            Timestamp = timestamp,
            TimestampMs = timestampMs
        };

        // Assert
        Assert.Equal(1, metrics.ExecutionNumber);
        Assert.Equal(executionId, metrics.ExecutionId);
        Assert.Equal(dataSizeBytes, metrics.DataSizeBytes);
        Assert.Equal(timestamp, metrics.Timestamp);
        Assert.Equal(timestampMs, metrics.TimestampMs);
    }

    [Fact]
    public void DataSizeBytes_CanBeSetToZero()
    {
        // Arrange & Act
        var metrics = new ExecutionMetrics
        {
            ExecutionNumber = 1,
            ExecutionId = Guid.NewGuid(),
            DataSizeBytes = 0,
            Timestamp = DateTime.UtcNow,
            TimestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        // Assert
        Assert.Equal(0, metrics.DataSizeBytes);
    }

    [Fact]
    public void DataSizeBytes_CanHandleLargeValues()
    {
        // Arrange
        var largeValue = long.MaxValue;

        // Act
        var metrics = new ExecutionMetrics
        {
            ExecutionNumber = 1,
            ExecutionId = Guid.NewGuid(),
            DataSizeBytes = largeValue,
            Timestamp = DateTime.UtcNow,
            TimestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
        };

        // Assert
        Assert.Equal(largeValue, metrics.DataSizeBytes);
    }
}

