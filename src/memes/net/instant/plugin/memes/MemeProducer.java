package net.instant.plugin.memes;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.Collections;
import java.util.Map;
import java.util.WeakHashMap;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;
import net.instant.api.ClientConnection;
import net.instant.api.RequestData;
import net.instant.api.RequestHook;
import net.instant.api.ResponseBuilder;
import net.instant.api.Utilities;

public class MemeProducer implements RequestHook {

    private static final Logger LOGGER = Logger.getLogger("MemeProducer");

    private static final Pattern PATH = Pattern.compile(
        "/meme/([a-zA-Z0-9_-]+)(?:/([a-zA-Z0-9_-]+))?(?:\\.(jpg|png))");

    public class MemeRequest implements Runnable {

        private final MemeComponent top;
        private final MemeComponent bottom;
        private final String type;
        private boolean resultPresent;
        private ByteBuffer result;
        private MemeRequestCallback callback;

        public MemeRequest(MemeComponent top, MemeComponent bottom,
                           String type) {
            this.top = top;
            this.bottom = bottom;
            this.type = type;
        }

        public MemeComponent getTop() {
            return top;
        }

        public MemeComponent getBottom() {
            return bottom;
        }

        public String getType() {
            return type;
        }

        public synchronized boolean hasResult() {
            return resultPresent;
        }
        public synchronized ByteBuffer getResult() {
            return result;
        }

        public synchronized MemeRequestCallback getCallback() {
            return callback;
        }
        public synchronized void setCallback(MemeRequestCallback cb) {
            callback = cb;
            if (resultPresent) cb.memeCreated(result);
        }

        public void run() {
            BufferedImage meme = manager.render(top, bottom);
            ByteBufferOutputStream stream = new ByteBufferOutputStream();
            ByteBuffer r;
            try {
                ImageIO.write(meme, type, stream);
                r = stream.toByteBuffer();
            } catch (IOException exc) {
                // Should not happen...
                LOGGER.log(Level.WARNING, "Could not encode image?!",
                           exc);
                r = null;
            }
            synchronized (this) {
                result = r;
                resultPresent = true;
                if (callback != null) callback.memeCreated(r);
            }
        }

    }

    public interface MemeRequestCallback {

        void memeCreated(ByteBuffer result);

    }

    private final MemeManager manager;
    private final Map<RequestData, MemeRequest> requests;
    private final Executor executor;

    public MemeProducer(MemeManager manager) {
        this.manager = manager;
        this.requests = Collections.synchronizedMap(
            new WeakHashMap<RequestData, MemeRequest>());
        this.executor = Executors.newCachedThreadPool();
    }

    public boolean evaluateRequest(RequestData req, ResponseBuilder resp) {
        String[] parts = Utilities.splitQueryString(req.getPath());
        Matcher m = PATH.matcher(parts[0]);
        if (! m.matches()) return false;
        String topName = m.group(1), bottomName = m.group(2),
               type = m.group(3);
        if (bottomName == null) bottomName = topName;
        MemeTemplate topTemplate = manager.template(topName),
                     bottomTemplate = manager.template(bottomName);
        if (topTemplate == null || bottomTemplate == null) return false;
        String topText = null, bottomText = null;
        if (parts[1] != null) {
            Map<String, String> params = Utilities.parseQueryString(
                parts[1]);
            topText = params.get("top");
            bottomText = params.get("bottom");
        }
        if (topText == null) topText = "";
        if (bottomText == null) bottomText = "";
        resp.respond(200, "OK", -1);
        resp.addHeader("Cache-Control", "public; max-age=3600");
        MemeRequest task = new MemeRequest(
            topTemplate.createComponent(topText),
            bottomTemplate.createComponent(bottomText),
            type);
        requests.put(req, task);
        executor.execute(task);
        return true;
    }

    public void onOpen(final ClientConnection req) {
        MemeRequest r = requests.remove(req);
        if (r == null) {
            req.getConnection().close();
            return;
        }
        r.setCallback(new MemeRequestCallback() {
            public void memeCreated(ByteBuffer result) {
                if (result != null)
                    req.getConnection().send(result);
                req.getConnection().close();
            }
        });
    }

    public void onInput(ClientConnection req, ByteBuffer data) {}

    public void onInput(ClientConnection req, String data) {}

    public void onClose(ClientConnection req, boolean normal) {}

    public void onError(ClientConnection req, Exception exc) {}

}
