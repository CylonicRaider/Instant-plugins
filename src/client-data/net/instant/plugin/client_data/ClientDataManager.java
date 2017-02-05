package net.instant.plugin.client_data;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;

public class ClientDataManager {

    // Two Gregorian calendar years of 365.2425 days of 86400 seconds, in
    // milliseconds. Should coincide roughly with the storage time of
    // the identification cookie.
    public static final long TIMEOUT = 63113904000L;

    private final Connection conn;
    private final PreparedStatement checkStmt;
    private final PreparedStatement queryStmt;
    private final PreparedStatement insertStmt;
    private final PreparedStatement refreshStmt;
    private final PreparedStatement updateStmt;
    private final PreparedStatement gcStmt;

    public ClientDataManager(Connection conn) {
        this.conn = conn;
        try {
            this.init();
            this.checkStmt = conn.prepareStatement(
                "SELECT 1 FROM clientData WHERE uuid = ?");
            this.queryStmt = conn.prepareStatement(
                "SELECT data FROM clientData WHERE uuid = ?");
            this.insertStmt = conn.prepareStatement(
                "INSERT INTO clientData(uuid, data, lastSeen) " +
                "VALUES (?, ?, ?)");
            this.refreshStmt = conn.prepareStatement(
                "UPDATE clientData SET lastSeen = ? WHERE uuid = ?");
            this.updateStmt = conn.prepareStatement(
                "UPDATE clientData SET data = ?, lastSeen = ? " +
                "WHERE uuid = ?");
            this.gcStmt = conn.prepareStatement(
                "DELETE FROM clientData WHERE lastSeen < ?");
        } catch (SQLException exc) {
            throw new RuntimeException(exc);
        }
    }

    protected synchronized void init() throws SQLException {
        Statement st = conn.createStatement();
        st.executeUpdate("CREATE TABLE IF NOT EXISTS clientData ( " +
            "uuid CHAR(36) PRIMARY KEY, " +
            "data VARCHAR(4096) NOT NULL, " +
            "lastSeen BIGINT NOT NULL " +
        ")");
        st.close();
    }

    public synchronized boolean refresh(UUID uuid) {
        try {
            refreshStmt.setLong(1, System.currentTimeMillis());
            refreshStmt.setString(2, uuid.toString());
            refreshStmt.executeUpdate();
            return true;
        } catch (SQLException exc) {
            exc.printStackTrace();
            return false;
        }
    }

    public synchronized String getData(UUID uuid) {
        try {
            queryStmt.setString(1, uuid.toString());
            ResultSet res = queryStmt.executeQuery();
            String ret = null;
            if (res.next()) ret = res.getString(1);
            res.close();
            return ret;
        } catch (SQLException exc) {
            exc.printStackTrace();
            return null;
        }
    }

    public synchronized boolean setData(UUID uuid, String data) {
        long now = System.currentTimeMillis();
        try {
            checkStmt.setString(1, uuid.toString());
            ResultSet res = checkStmt.executeQuery();
            if (res.next()) {
                updateStmt.setString(1, data);
                updateStmt.setLong(2, now);
                updateStmt.setString(3, uuid.toString());
                return (updateStmt.executeUpdate() == 1);
            } else {
                insertStmt.setString(1, uuid.toString());
                insertStmt.setString(2, data);
                insertStmt.setLong(3, now);
                return (insertStmt.executeUpdate() == 1);
            }
        } catch (SQLException exc) {
            exc.printStackTrace();
            return false;
        }
    }

    public synchronized boolean gc() {
        try {
            gcStmt.setLong(1, System.currentTimeMillis() - TIMEOUT);
            gcStmt.executeUpdate();
            return true;
        } catch (SQLException exc) {
            exc.printStackTrace();
            return false;
        }
    }

    public void startGCThread() {
        new Thread() {

            {
                setDaemon(true);
            }

            public void run() {
                for (;;) {
                    gc();
                    try {
                        // A day.
                        Thread.sleep(86400000);
                    } catch (InterruptedException exc) {
                        break;
                    }
                }
            }

        }.start();
    }

}
