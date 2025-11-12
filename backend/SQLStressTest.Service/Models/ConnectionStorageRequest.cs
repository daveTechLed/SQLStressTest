namespace SQLStressTest.Service.Models;

/// <summary>
/// Request to save a connection configuration
/// </summary>
public class SaveConnectionRequest
{
    /// <summary>
    /// Connection configuration to save
    /// </summary>
    public ConnectionConfigDto Connection { get; set; } = new();
}

/// <summary>
/// Request to update a connection configuration
/// </summary>
public class UpdateConnectionRequest
{
    /// <summary>
    /// Connection ID to update
    /// </summary>
    public string Id { get; set; } = string.Empty;

    /// <summary>
    /// Updated connection configuration
    /// </summary>
    public ConnectionConfigDto Connection { get; set; } = new();
}

/// <summary>
/// Request to delete a connection
/// </summary>
public class DeleteConnectionRequest
{
    /// <summary>
    /// Connection ID to delete
    /// </summary>
    public string Id { get; set; } = string.Empty;
}

/// <summary>
/// Request to load all connections
/// </summary>
public class LoadConnectionsRequest
{
    // No parameters needed - loads all connections
}

/// <summary>
/// Connection configuration DTO matching TypeScript interface
/// </summary>
public class ConnectionConfigDto
{
    public string Id { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string Server { get; set; } = string.Empty;
    public string? Database { get; set; }
    public string? Username { get; set; }
    public string? Password { get; set; }
    public bool IntegratedSecurity { get; set; }
    public int? Port { get; set; }
}

