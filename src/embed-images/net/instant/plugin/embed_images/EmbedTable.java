package net.instant.plugin.embed_images;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.LineNumberReader;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import net.instant.api.Utilities;

public class EmbedTable {

    private static final Pattern IGNORE = Pattern.compile(
        "^\\s*(#.*)?$");
    private static final Pattern FIELD = Pattern.compile(
        "(([^\\\\|]+|\\\\[\\\\|\\.])*)(\\||$)");
    private static final Pattern ESCAPE = Pattern.compile("\\\\(.)");

    private final Map<String, String> table;

    public EmbedTable(Map<String, String> table) {
        this.table = Collections.unmodifiableMap(
            new LinkedHashMap<String, String>(table));
    }

    public Map<String, String> getTable() {
        return table;
    }

    public String toJS() {
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (Map.Entry<String, String> e : table.entrySet()) {
            if (first) {
                first = false;
            } else {
                sb.append(", ");
            }
            sb.append("[");
            sb.append(Utilities.escapeStringJS(e.getKey(), true));
            sb.append(", ");
            sb.append(Utilities.escapeStringJS(e.getValue(), true));
            sb.append("]");
        }
        return sb.append("]").toString();
    }

    public static EmbedTable parse(InputStream stream)
            throws IOException, TableSyntaxException {
        Map<String, String> table = new LinkedHashMap<String, String>();
        LineNumberReader reader = new LineNumberReader(
            new InputStreamReader(stream));
        try {
            for (;;) {
                String line = reader.readLine();
                if (line == null) break;
                /* Skip empty / comment lines */
                if (IGNORE.matcher(line).matches()) continue;
                /* Match the first field */
                Matcher m = FIELD.matcher(line);
                if (! m.lookingAt())
                    throw new TableSyntaxException("Invalid syntax at " +
                        reader.getLineNumber() + " (invalid first field)");
                String k = unescape(m.group(1));
                /* Match the second field */
                m.region(m.end(), line.length());
                if (! m.lookingAt())
                    throw new TableSyntaxException("Invalid syntax at " +
                        reader.getLineNumber() + " (invalid second field)");
                String v = unescape(m.group(1));
                /* Ensure we're actually at the end of the input */
                if (! m.group(3).isEmpty())
                    throw new TableSyntaxException("Invalid syntax at " +
                        reader.getLineNumber() + " (too many fields)");
                table.put(k, v);
            }
        } finally {
            reader.close();
        }
        return new EmbedTable(table);
    }

    private static final String unescape(String input) {
        Matcher m = ESCAPE.matcher(input);
        StringBuffer sb = new StringBuffer();
        while (m.find()) {
            switch (m.group(1)) {
                case "\\": case "|":
                    m.appendReplacement(sb, "$1");
                    break;
                default:
                    m.appendReplacement(sb, "\\\\$1");
                    break;
            }
        }
        m.appendTail(sb);
        return sb.toString();
    }

}
