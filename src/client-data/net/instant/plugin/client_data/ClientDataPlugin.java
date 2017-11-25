package net.instant.plugin.client_data;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Map;
import net.instant.api.API1;
import net.instant.api.PluginData;

public class ClientDataPlugin {

    private static Connection conn = null;
    private static ClientDataManager dataManager = null;

    public static synchronized ClientDataManager getDataManager() {
        if (dataManager == null)
            throw new IllegalStateException("Plugin not yet initialized");
        return dataManager;
    }

    public static void initInstantPlugin1(API1 api, PluginData data) {
        @SuppressWarnings("unchecked")
        Map<String, Object> sqlite =
            (Map<String, Object>) api.getPluginData("sqlite");
        String template = (String) sqlite.get("template");
        try {
            conn = DriverManager.getConnection(String.format(template,
                                                             "client-data"));
        } catch (SQLException exc) {
            throw new RuntimeException(exc);
        }
        synchronized (ClientDataPlugin.class) {
            dataManager = new ClientDataManager(conn);
        }
        api.scheduleJob(dataManager.gcWorker(), 0,
                        ClientDataManager.GC_INTERVAL);
        api.addMessageHook(new MessageHandler(dataManager));
    }

}
