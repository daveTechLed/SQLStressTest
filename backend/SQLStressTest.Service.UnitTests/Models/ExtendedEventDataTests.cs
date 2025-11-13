using SQLStressTest.Service.Models;
using Xunit;

namespace SQLStressTest.Service.Tests.Models;

public class ExtendedEventDataTests
{
    [Fact]
    public void Constructor_InitializesEmptyDictionaries()
    {
        // Act
        var data = new ExtendedEventData();

        // Assert
        Assert.NotNull(data.EventFields);
        Assert.NotNull(data.Actions);
        Assert.Empty(data.EventFields);
        Assert.Empty(data.Actions);
    }

    [Fact]
    public void GetField_ReturnsValue_WhenFieldExists()
    {
        // Arrange
        var data = new ExtendedEventData
        {
            EventFields = new Dictionary<string, object?>
            {
                { "duration", 100 },
                { "logical_reads", 5000L }
            }
        };

        // Act
        var duration = data.GetField<int>("duration");
        var reads = data.GetField<long>("logical_reads");

        // Assert
        Assert.Equal(100, duration);
        Assert.Equal(5000L, reads);
    }

    [Fact]
    public void GetField_ReturnsDefault_WhenFieldDoesNotExist()
    {
        // Arrange
        var data = new ExtendedEventData();

        // Act
        var value = data.GetField<int>("nonexistent");

        // Assert
        Assert.Equal(default(int), value);
    }

    [Fact]
    public void GetField_ConvertsTypes_WhenNeeded()
    {
        // Arrange
        var data = new ExtendedEventData
        {
            EventFields = new Dictionary<string, object?>
            {
                { "duration", "100" } // String instead of int
            }
        };

        // Act
        var duration = data.GetField<int>("duration");

        // Assert
        Assert.Equal(100, duration);
    }

    [Fact]
    public void GetAction_ReturnsValue_WhenActionExists()
    {
        // Arrange
        var data = new ExtendedEventData
        {
            Actions = new Dictionary<string, object?>
            {
                { "sqlserver.session_id", 12345 }
            }
        };

        // Act
        var sessionId = data.GetAction<int>("sqlserver.session_id");

        // Assert
        Assert.Equal(12345, sessionId);
    }

    [Fact]
    public void GetAction_ReturnsDefault_WhenActionDoesNotExist()
    {
        // Arrange
        var data = new ExtendedEventData();

        // Act
        var value = data.GetAction<string>("nonexistent");

        // Assert
        Assert.Null(value);
    }
}

