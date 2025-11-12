namespace SQLStressTest.Service.Models;

/// <summary>
/// Base response DTO for storage operations
/// </summary>
public class StorageResponse<T>
{
    /// <summary>
    /// Indicates if the operation was successful
    /// </summary>
    public bool Success { get; set; }

    /// <summary>
    /// Error message if operation failed
    /// </summary>
    public string? Error { get; set; }

    /// <summary>
    /// Response data (null if operation failed or no data to return)
    /// </summary>
    public T? Data { get; set; }
}

/// <summary>
/// Non-generic response for operations that don't return data
/// </summary>
public class StorageResponse : StorageResponse<object>
{
    public static StorageResponse Ok()
    {
        return new StorageResponse { Success = true };
    }

    public static StorageResponse<T> Ok<T>(T data)
    {
        return new StorageResponse<T> { Success = true, Data = data };
    }

    public static StorageResponse CreateError(string error)
    {
        return new StorageResponse { Success = false, Error = error };
    }

    public static StorageResponse<T> CreateError<T>(string error)
    {
        return new StorageResponse<T> { Success = false, Error = error };
    }
}

/// <summary>
/// Extension methods for StorageResponse<T>
/// </summary>
public static class StorageResponseExtensions
{
    public static StorageResponse<T> CreateError<T>(string error)
    {
        return new StorageResponse<T> { Success = false, Error = error };
    }
}

