package net.instant.plugin.memes;

import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.util.Map;
import java.util.logging.Logger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;
import net.instant.api.FileGenerator;
import net.instant.api.FileInfo;
import net.instant.api.Utilities;

public class MemeProducer implements FileGenerator {

    private static final Logger LOGGER = Logger.getLogger("MemeProducer");

    private static final Pattern PATH = Pattern.compile("/static/meme/" +
        "([a-zA-Z0-9_-]+)(?:/([a-zA-Z0-9_-]+))?(?:\\.(jpg|png))");

    public static final int CACHE_TIME = 3600000;

    public static class MemeInfo implements FileInfo {

        private final String path;
        private final ByteBuffer data;
        private final long created;

        public MemeInfo(String path, ByteBuffer data) {
            this.path = path;
            this.data = data;
            this.created = System.currentTimeMillis();
        }

        public String getName() {
            return path;
        }

        public ByteBuffer getData() {
            return data;
        }

        public long getCreated() {
            return created;
        }

        public boolean isValid() {
            return (System.currentTimeMillis() <= created + CACHE_TIME);
        }

    }

    private final MemeManager manager;

    public MemeProducer(MemeManager manager) {
        this.manager = manager;
    }

    public boolean hasFile(String path) {
        String[] parts = Utilities.splitQueryString(path);
        Matcher m = PATH.matcher(parts[0]);
        if (! m.matches()) return false;
        String topName = m.group(1), bottomName = m.group(2);
        if (bottomName == null) bottomName = topName;
        return (manager.template(topName) != null &&
                manager.template(bottomName) != null);
    }

    public FileInfo generateFile(String path) throws IOException {
        /* Obtain meme templates and file type */
        String[] parts = Utilities.splitQueryString(path);
        Matcher m = PATH.matcher(parts[0]);
        if (! m.matches())
            throw new IOException("Attempting to generate meme with " +
                "incorrect path?!");
        String topName = m.group(1), bottomName = m.group(2),
               type = m.group(3);
        if (bottomName == null) bottomName = topName;
        MemeTemplate topTemp = manager.template(topName),
                     bottomTemp = manager.template(bottomName);
        if (topTemp == null || bottomTemp == null)
            throw new IOException("Meme templates suddenly disappeared?!");
        /* Extract additional values */
        String topText = null, bottomText = null;
        boolean flipTop = false, flipBottom = false;
        if (parts[1] != null) {
            Map<String, String> params = Utilities.parseQueryString(
                parts[1]);
            topText = params.get("top");
            bottomText = params.get("bottom");
            if (Utilities.isTrue(params.get("flip")))
                flipTop = flipBottom = true;
            if (Utilities.isTrue(params.get("flop")))
                flipBottom ^= true;
        }
        if (topText == null) topText = "";
        if (bottomText == null) bottomText = "";
        /* Generate the meme */
        MemeComponent top = topTemp.createComponent(topText, flipTop),
                      bottom = bottomTemp.createComponent(bottomText,
                                                          flipBottom);
        BufferedImage meme = manager.render(top, bottom);
        ByteBufferOutputStream stream = new ByteBufferOutputStream();
        writeImage(meme, type, stream);
        return new MemeInfo(path, stream.toByteBuffer());
    }

    private static void writeImage(BufferedImage image, String type,
            OutputStream stream) throws IOException {
        ImageIO.write(image, type, stream);
    }

}
