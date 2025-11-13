using Microsoft.SqlServer.XEvent.XELite;
using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for converting Extended Events to DTOs.
/// Single Responsibility: Event conversion only.
/// </summary>
public class ExtendedEventConverter
{
    /// <summary>
    /// Converts an IXEvent to ExtendedEventData DTO.
    /// </summary>
    public ExtendedEventData ConvertToExtendedEventData(IXEvent xevent, Guid executionId, int executionNumber)
    {
        var eventData = new ExtendedEventData
        {
            EventName = xevent.Name,
            Timestamp = xevent.Timestamp.DateTime,
            ExecutionId = executionId,
            ExecutionNumber = executionNumber
        };

        // Convert event fields
        foreach (var field in xevent.Fields)
        {
            eventData.EventFields[field.Key] = ConvertValue(field.Value);
        }

        // Convert actions
        foreach (var action in xevent.Actions)
        {
            eventData.Actions[action.Key] = ConvertValue(action.Value);
        }

        return eventData;
    }

    /// <summary>
    /// Converts a value to a JSON-serializable format.
    /// </summary>
    private object? ConvertValue(object? value)
    {
        if (value == null)
        {
            return null;
        }

        // Handle byte arrays (like context_info) - convert to base64 string for JSON serialization
        if (value is byte[] bytes)
        {
            return Convert.ToBase64String(bytes);
        }

        // Handle other types - let JSON serializer handle them
        return value;
    }
}

