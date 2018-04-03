package net.instant.plugin.memes;

import java.io.IOException;
import java.net.MalformedURLException;
import java.net.URL;
import java.util.logging.Level;
import java.util.logging.Logger;
import net.instant.api.API1;
import net.instant.api.PluginData;
import net.instant.api.Utilities;

public class MemesPlugin {

    private static final Logger LOGGER = Logger.getLogger("MemesPlugin");

    public static final URL defaultConfigURL =
        MemesPlugin.class.getResource("/memes.conf");

    public static Object initInstantPlugin1(API1 api, PluginData data) {
        api.handleDefault(data);
        String config = api.getConfiguration("memes.config");
        URL configURL = defaultConfigURL;
        if (Utilities.nonempty(config)) {
            try {
                configURL = Utilities.makeURL(config);
            } catch (MalformedURLException exc) {
                LOGGER.log(Level.SEVERE, "Invalid configuration path; " +
                           "using default", exc);
            }
        }
        LOGGER.config("Loading configuration file: " + configURL);
        MemeManager mgr = new MemeManager();
        try {
            mgr.loadConfig(configURL);
        } catch (IOException exc) {
            LOGGER.log(Level.SEVERE, "I/O error while loading configuration",
                       exc);
            return null;
        } catch (ConfigException exc) {
            LOGGER.log(Level.SEVERE, "Could not load configuration", exc);
            return null;
        }
        api.addRequestHook(new MemeProducer(mgr, api.getExecutor()));
        return mgr;
    }

}
