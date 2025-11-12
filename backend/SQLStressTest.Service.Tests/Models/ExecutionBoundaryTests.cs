using SQLStressTest.Service.Models;
using Xunit;

namespace SQLStressTest.Service.Tests.Models;

public class ExecutionBoundaryTests
{
    [Fact]
    public void Constructor_InitializesProperties()
    {
        // Arrange
        var executionId = Guid.NewGuid();
        var startTime = DateTime.UtcNow;
        var timestampMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        // Act
        var boundary = new ExecutionBoundary
        {
            ExecutionNumber = 1,
            ExecutionId = executionId,
            StartTime = startTime,
            EndTime = null,
            IsStart = true,
            TimestampMs = timestampMs
        };

        // Assert
        Assert.Equal(1, boundary.ExecutionNumber);
        Assert.Equal(executionId, boundary.ExecutionId);
        Assert.Equal(startTime, boundary.StartTime);
        Assert.Null(boundary.EndTime);
        Assert.True(boundary.IsStart);
        Assert.Equal(timestampMs, boundary.TimestampMs);
    }

    [Fact]
    public void EndTime_CanBeSet()
    {
        // Arrange
        var startTime = DateTime.UtcNow;
        var endTime = startTime.AddSeconds(5);

        // Act
        var boundary = new ExecutionBoundary
        {
            ExecutionNumber = 1,
            ExecutionId = Guid.NewGuid(),
            StartTime = startTime,
            EndTime = endTime,
            IsStart = false,
            TimestampMs = ((DateTimeOffset)endTime).ToUnixTimeMilliseconds()
        };

        // Assert
        Assert.NotNull(boundary.EndTime);
        Assert.Equal(endTime, boundary.EndTime);
        Assert.False(boundary.IsStart);
    }
}

