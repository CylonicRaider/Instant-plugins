package net.instant.plugin.sqlite;

import java.io.File;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;
import net.instant.api.API1;
import net.instant.api.PluginData;

public class SQLitePlugin {

    private static String locationTemplate;

    public static Connection connect(String dbName) throws SQLException {
        String conn;
        if (dbName == null) {
            conn = "jdbc:sqlite::memory:";
        } else {
            conn = String.format(locationTemplate, dbName);
        }
        return DriverManager.getConnection(conn);
    }

    public static Object initInstantPlugin1(API1 api, PluginData data) {
        try {
            Class.forName("org.sqlite.JDBC");
        } catch (ClassNotFoundException exc) {
            throw new RuntimeException("Failed to load SQLite", exc);
        }
        String loc = api.getConfiguration("instant.sqlite.basedir");
        File baseLocation;
        if (loc != null) {
            baseLocation = new File(loc);
        } else {
            baseLocation = new File("db");
        }
        baseLocation = baseLocation.getAbsoluteFile();
        baseLocation.mkdirs();
        if (! baseLocation.isDirectory())
            throw new IllegalStateException("Cannot access database " +
                "directory!");
        String locationStr = baseLocation.toString();
        if (! locationStr.endsWith(File.separator))
            locationStr += File.separator;
        locationTemplate = "jdbc:sqlite:" +
            locationStr.replace("%", "%%") + "%s.db";
        Map<String, Object> ret = new HashMap<String, Object>();
        ret.put("location", locationStr);
        ret.put("template", locationTemplate);
        return ret;
    }

}
