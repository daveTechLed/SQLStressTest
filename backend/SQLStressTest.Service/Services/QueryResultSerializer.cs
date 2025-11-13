using System.Text;

namespace SQLStressTest.Service.Services;

/// <summary>
/// Service responsible for serializing query results to JSON.
/// Single Responsibility: JSON serialization only.
/// </summary>
public class QueryResultSerializer
{
    /// <summary>
    /// Manually builds JSON string from columns and rows to avoid reflection-based serialization issues.
    /// Format: {"columns":["col1","col2"],"rows":[[val1,val2],[val3,val4]]}
    /// </summary>
    public string? BuildResultDataJson(List<string>? columns, List<List<object?>>? rows)
    {
        if (columns == null || rows == null || columns.Count == 0)
        {
            return null;
        }

        var sb = new StringBuilder();
        sb.Append("{\"columns\":[");

        // Serialize columns array
        for (int i = 0; i < columns.Count; i++)
        {
            if (i > 0) sb.Append(',');
            sb.Append('"');
            EscapeJsonString(sb, columns[i]);
            sb.Append('"');
        }

        sb.Append("],\"rows\":[");

        // Serialize rows array
        for (int rowIndex = 0; rowIndex < rows.Count; rowIndex++)
        {
            if (rowIndex > 0) sb.Append(',');
            sb.Append('[');

            var row = rows[rowIndex];
            for (int colIndex = 0; colIndex < row.Count; colIndex++)
            {
                if (colIndex > 0) sb.Append(',');

                var value = row[colIndex];
                if (value == null)
                {
                    sb.Append("null");
                }
                else if (value is string str)
                {
                    sb.Append('"');
                    EscapeJsonString(sb, str);
                    sb.Append('"');
                }
                else if (value is bool b)
                {
                    sb.Append(b ? "true" : "false");
                }
                else if (value is int || value is long || value is short || value is byte || 
                         value is uint || value is ulong || value is ushort || value is sbyte)
                {
                    sb.Append(value);
                }
                else if (value is decimal || value is double || value is float)
                {
                    sb.Append(value);
                }
                else if (value is DateTime dt)
                {
                    sb.Append('"');
                    // Convert to UTC and format as ISO 8601
                    var utc = dt.Kind == DateTimeKind.Unspecified 
                        ? DateTime.SpecifyKind(dt, DateTimeKind.Utc).ToUniversalTime()
                        : dt.ToUniversalTime();
                    sb.Append(utc.ToString("yyyy-MM-ddTHH:mm:ss.fffZ"));
                    sb.Append('"');
                }
                else if (value is Guid guid)
                {
                    sb.Append('"');
                    sb.Append(guid.ToString());
                    sb.Append('"');
                }
                else
                {
                    // For other types, convert to string and escape
                    sb.Append('"');
                    EscapeJsonString(sb, value.ToString() ?? string.Empty);
                    sb.Append('"');
                }
            }

            sb.Append(']');
        }

        sb.Append("]}");
        return sb.ToString();
    }

    /// <summary>
    /// Escapes special characters in JSON strings
    /// </summary>
    private static void EscapeJsonString(StringBuilder sb, string value)
    {
        if (string.IsNullOrEmpty(value))
        {
            return;
        }

        foreach (char c in value)
        {
            switch (c)
            {
                case '"':
                    sb.Append("\\\"");
                    break;
                case '\\':
                    sb.Append("\\\\");
                    break;
                case '\b':
                    sb.Append("\\b");
                    break;
                case '\f':
                    sb.Append("\\f");
                    break;
                case '\n':
                    sb.Append("\\n");
                    break;
                case '\r':
                    sb.Append("\\r");
                    break;
                case '\t':
                    sb.Append("\\t");
                    break;
                default:
                    // Escape control characters (U+0000 to U+001F)
                    if (char.IsControl(c))
                    {
                        sb.AppendFormat("\\u{0:X4}", (int)c);
                    }
                    else
                    {
                        sb.Append(c);
                    }
                    break;
            }
        }
    }
}

