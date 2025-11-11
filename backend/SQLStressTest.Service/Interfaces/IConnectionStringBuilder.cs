using SQLStressTest.Service.Models;

namespace SQLStressTest.Service.Interfaces;

public interface IConnectionStringBuilder
{
    string Build(ConnectionConfig config);
}

