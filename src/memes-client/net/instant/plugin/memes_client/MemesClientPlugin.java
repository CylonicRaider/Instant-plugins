package net.instant.plugin.memes_client;

import net.instant.api.API1;
import net.instant.api.PluginData;
import net.instant.api.Utilities;
import net.instant.plugin.memes.MemeManager;
import net.instant.plugin.memes.MemeTemplate;

public class MemesClientPlugin {

    public static String getFrontendData(MemeManager mgr) {
        StringBuilder sb = new StringBuilder("[");
        boolean first = true;
        for (MemeTemplate t : mgr.templates()) {
            if (first) {
                first = false;
            } else {
                sb.append(", ");
            }
            sb.append("[");
            sb.append(Utilities.escapeStringJS(t.getName(), true));
            sb.append(", ");
            sb.append(Utilities.escapeStringJS(t.getDescription(), true));
            sb.append("]");
        }
        return sb.append("]").toString();
    }

    public static void initInstantPlugin1(API1 api, PluginData data) {
        api.handleDefault(data);
        MemeManager mgr = (MemeManager) api.getPluginData("memes");
        api.addSiteCode("Instant.plugins.mailbox(\"memes\").post(" +
            getFrontendData(mgr) + ");");
    }

}
