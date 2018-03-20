package net.instant.plugin.embed_images;

import java.io.File;
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
        String config = api.getConfiguration("embed-images.config");
        URL configURL;
        if (Utilities.nonempty(config)) {
            try {
                configURL = new File(config).toURI().toURL();
            } catch (MalformedURLException exc) {
                LOGGER.log(Level.SEVERE, "Invalid configuration path; " +
                           "using default", exc);
                configURL = defaultConfigURL;
            }
        } else {
            configURL = defaultConfigURL;
        }
        LOGGER.config("Reading configuration file: " + configURL);
        InputStream stream;
        try {
            stream = configURL.openStream();
        } catch (IOException exc) {
            LOGGER.log(Level.SEVERE, "Could not fetch configuration", exc);
            return null;
        }
        EmbedTable tab;
        try {
            tab = EmbedTable.parse(stream);
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
