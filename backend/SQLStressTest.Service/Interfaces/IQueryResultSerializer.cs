namespace SQLStressTest.Service.Interfaces;

/// <summary>
/// Interface for query result serializer.
/// </summary>
public interface IQueryResultSerializer
{
    string? BuildResultDataJson(List<string>? columns, List<List<object?>>? rows);
}

