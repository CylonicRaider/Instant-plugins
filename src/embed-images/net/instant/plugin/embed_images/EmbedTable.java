package net.instant.plugin.embed_images;

import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.LineNumberReader;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import net.instant.api.Utilities;

public class EmbedTable {

    private static final Pattern IGNORE = Pattern.compile(
        "^\\s*(#.*)?$");
    private static final Pattern FIELD = Pattern.compile(
        "(([^\\\\|]+|\\\\[\\\\|\\.])*)(\\||$)");
    private static final Pattern ESCAPE = Pattern.compile("\\\\(.)");

    public static class Entry {

        private final String regex, sourceTemplate, linkTemplate;

        public Entry(String regex, String sourceTemplate,
                     String linkTemplate) {
            if (regex == null || sourceTemplate == null)
                throw new NullPointerException();
            this.regex = regex;
            this.sourceTemplate = sourceTemplate;
            this.linkTemplate = linkTemplate;
        }

        public String getRegex() {
            return regex;
        }

        public String getSourceTemplate() {
            return sourceTemplate;
        }

        public String getLinkTemplate() {
            return linkTemplate;
        }

    }

    private final List<Entry> table;

    public EmbedTable(List<Entry> table) {
        this.table = Collections.unmodifiableList(new ArrayList<Entry>(
            table));
    }

    public List<Entry> getTable() {
        return table;
    }

    public String toJS() {
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (Entry e : table) {
            if (first) {
                first = false;
            } else {
                sb.append(", ");
            }
            sb.append("[");
            sb.append(Utilities.escapeStringJS(e.getRegex(), true));
            sb.append(", ");
            sb.append(Utilities.escapeStringJS(e.getSourceTemplate(), true));
            if (e.getLinkTemplate() != null) {
                sb.append(", ");
                sb.append(Utilities.escapeStringJS(e.getLinkTemplate(),
                                                   true));
            }
            sb.append("]");
        }
        return sb.append("]").toString();
    }

    public static EmbedTable parse(InputStream stream)
            throws IOException, TableSyntaxException {
        List<Entry> table = new ArrayList<Entry>();
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
                        "line " + reader.getLineNumber() + " (invalid " +
                        "first field)");
                String r = unescape(m.group(1));
                /* Match the second field */
                m.region(m.end(), line.length());
                if (! m.lookingAt())
                    throw new TableSyntaxException("Invalid syntax at " +
                        "line " + reader.getLineNumber() + " (invalid " +
                        "second field)");
                String s = unescape(m.group(1));
                /* Line can end here */
                if (m.group(3).isEmpty()) {
                    table.add(new Entry(r, s, null));
                    continue;
                }
                /* Match the third field */
                m.region(m.end(), line.length());
                if (! m.lookingAt())
                    throw new TableSyntaxException("Invalid syntax at " +
                        "line " + reader.getLineNumber() + " (invalid " +
                        "third field)");
                String l = unescape(m.group(1));
                /* Line must end here, if it did not before */
                if (! m.group(3).isEmpty())
                    throw new TableSyntaxException("Invalid syntax at " +
                        "line " + reader.getLineNumber() + " (too many " +
                        "fields)");
                table.add(new Entry(r, s, l));
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
