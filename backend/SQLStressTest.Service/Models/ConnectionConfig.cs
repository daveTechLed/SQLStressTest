namespace SQLStressTest.Service.Models;

public class ConnectionConfig
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

