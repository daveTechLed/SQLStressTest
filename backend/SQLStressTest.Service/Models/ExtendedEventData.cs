using System.Text.Json;

namespace SQLStressTest.Service.Models;

/// <summary>
/// Extensible model for Extended Events data that can accommodate any event type and its attributes.
/// Uses a flexible dictionary structure to store dynamic event fields without requiring model changes
/// for new event types or attributes.
/// </summary>
public class ExtendedEventData
{
    /// <summary>
    /// The name of the Extended Event (e.g., "sql_batch_completed", "wait_info", "lock_deadlock")
    /// </summary>
    public string EventName { get; set; } = string.Empty;
    
    /// <summary>
    /// Timestamp when the event occurred
    /// </summary>
    public DateTime Timestamp { get; set; }
    
    /// <summary>
    /// Execution ID (GUID from context_info) to correlate events to specific query executions
    /// </summary>
    public Guid ExecutionId { get; set; }
    
    /// <summary>
    /// Execution number (1-based index of the execution in the stress test)
    /// </summary>
    public int ExecutionNumber { get; set; }
    
    /// <summary>
    /// Extensible dictionary storing all event-specific fields dynamically.
    /// Examples:
    /// - sql_batch_completed: duration, logical_reads, writes, cpu_time, physical_reads, row_count, statement, etc.
    /// - wait_info: wait_type, wait_duration_ms, signal_duration_ms, etc.
    /// - lock events: lock_mode, database_name, object_id, etc.
    /// - deadlock events: deadlock_id, victim_process, etc.
    /// </summary>
    public Dictionary<string, object?> EventFields { get; set; } = new Dictionary<string, object?>();
    
    /// <summary>
    /// Actions captured with the event (e.g., sqlserver.session_id, sqlserver.sql_text, sqlserver.context_info)
    /// </summary>
    public Dictionary<string, object?> Actions { get; set; } = new Dictionary<string, object?>();
    
    /// <summary>
    /// Helper method to get a typed value from EventFields
    /// </summary>
    public T? GetField<T>(string fieldName)
    {
        if (EventFields.TryGetValue(fieldName, out var value) && value != null)
        {
            if (value is JsonElement jsonElement)
            {
                return JsonSerializer.Deserialize<T>(jsonElement.GetRawText());
            }
            
            if (value is T directValue)
            {
                return directValue;
            }
            
            // Try to convert
            try
            {
                return (T)Convert.ChangeType(value, typeof(T));
            }
            catch
            {
                return default;
            }
        }
        return default;
    }
    
    /// <summary>
    /// Helper method to get a typed value from Actions
    /// </summary>
    public T? GetAction<T>(string actionName)
    {
        if (Actions.TryGetValue(actionName, out var value) && value != null)
        {
            if (value is JsonElement jsonElement)
            {
                return JsonSerializer.Deserialize<T>(jsonElement.GetRawText());
            }
            
            if (value is T directValue)
            {
                return directValue;
            }
            
            // Try to convert
            try
            {
                return (T)Convert.ChangeType(value, typeof(T));
            }
            catch
            {
                return default;
            }
        }
        return default;
    }
}

