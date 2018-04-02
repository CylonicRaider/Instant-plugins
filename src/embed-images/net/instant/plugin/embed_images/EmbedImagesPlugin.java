package net.instant.plugin.embed_images;

import java.io.IOException;
import java.io.InputStream;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.logging.Level;
import java.util.logging.Logger;
import net.instant.api.API1;
import net.instant.api.PluginData;
import net.instant.api.Utilities;

public class EmbedImagesPlugin {

    private static final Logger LOGGER =
        Logger.getLogger("EmbedImagesPlugin");

    public static final URL defaultConfigURL =
        EmbedImagesPlugin.class.getResource("/embed-images.conf");

    public static Object initInstantPlugin1(API1 api, PluginData data) {
        api.handleDefault(data);
        URL configURL = defaultConfigURL;
        String config = api.getConfiguration("embed-images.config");
        if (Utilities.nonempty(config)) {
            try {
                configURL = Utilities.makeURL(config);
            } catch (MalformedURLException exc) {
                LOGGER.log(Level.SEVERE, "Invalid configuration path; " +
                           "using default", exc);
            }
        }
        LOGGER.config("Reading configuration file: " + configURL);
        EmbedTable tab = new EmbedTable();
        try {
            InputStream stream = configURL.openStream();
            tab.parseConfig(stream);
        } catch (IOException exc) {
            LOGGER.log(Level.SEVERE, "I/O error while reading configuration",
                       exc);
            return null;
        } catch (TableSyntaxException exc) {
            LOGGER.log(Level.SEVERE, "Invalid image embedder configuration",
                       exc);
            return null;
        }
        api.addSiteCode("Instant.plugins.mailbox(\"embed-images\").post(" +
            tab.toJS() + ");");
        return tab;
    }

}
