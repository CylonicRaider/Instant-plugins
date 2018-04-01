package net.instant.plugin.memes;

import java.awt.Color;
import java.awt.Font;
import java.awt.FontFormatException;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.LineNumberReader;
import java.net.URL;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.imageio.ImageIO;

public class MemeManager {

    private static final Pattern IGNORE_LINE = Pattern.compile(
        "\\s*(#.*)?");
    private static final Pattern ASSIGN_LINE = Pattern.compile(
        "\\s*([^=]+)\\s*=\\s*(.*)\\s*");
    private static final Pattern MEME_LINE = Pattern.compile(
        "\\s*([^|]*[^|\\s])\\s*\\|\\s*([^|]*[^|\\s])\\s*\\|" +
        "\\s*([^|]*[^|\\s])\\s*");

    public static final int DEFAULT_FONT_SIZE = 12;

    private final Map<String, MemeTemplate> templates;
    private MemeRenderer renderer;

    public MemeManager(MemeRenderer renderer) {
        this.templates = Collections.synchronizedMap(
            new HashMap<String, MemeTemplate>());
        this.renderer = renderer;
    }
    public MemeManager() {
        this(null);
    }

    public Map<String, MemeTemplate> getTemplates() {
        return templates;
    }
    public List<MemeTemplate> templates() {
        synchronized (templates) {
            return new ArrayList<MemeTemplate>(templates.values());
        }
    }
    public MemeTemplate template(String name) {
        return templates.get(name);
    }

    public MemeRenderer getRenderer() {
        return renderer;
    }
    public void setRenderer(MemeRenderer r) {
        renderer = r;
    }

    public MemeComponent component(String name, String text) {
        MemeTemplate template = templates.get(name);
        if (template == null) return null;
        return template.createComponent(text);
    }

    public BufferedImage render(MemeComponent top, MemeComponent bottom) {
        return renderer.render(top, bottom);
    }

    public void loadConfig(URL source) throws ConfigException, IOException {
        InputStream stream = source.openStream();
        LineNumberReader reader = new LineNumberReader(
            new InputStreamReader(stream));
        templates.clear();
        BufferedImage backgroundImage = null;
        Font rendererFont = new Font(Font.SANS_SERIF, Font.PLAIN,
                                     DEFAULT_FONT_SIZE);
        Color textColor = Color.WHITE;
        Color outlineColor = Color.BLACK;
        float outlineWidth = 1.0f;
        for (;;) {
            String line = reader.readLine();
            if (line == null) break;
            if (IGNORE_LINE.matcher(line).matches()) continue;
            Matcher m = ASSIGN_LINE.matcher(line);
            if (m.matches()) {
                String name = m.group(1), value = m.group(2);
                try {
                    switch (name) {
                        case "background":
                            backgroundImage = loadImage(new URL(source,
                                                                value));
                            break;
                        case "font-location":
                            URL fontURL = new URL(source, value);
                            rendererFont = Font.createFont(
                                // Only TrueType and Type1 are documented
                                // as of this writing.
                                value.endsWith(".ttf") ? Font.TRUETYPE_FONT :
                                                         Font.TYPE1_FONT,
                                fontURL.openStream())
                                .deriveFont(rendererFont.getSize2D());
                            break;
                        case "font-name":
                            rendererFont = new Font(value, Font.PLAIN,
                                rendererFont.getSize());
                            break;
                        case "font-size":
                            rendererFont = rendererFont.deriveFont(
                                (float) Integer.parseInt(value));
                            break;
                        case "text-color":
                            textColor = Color.decode(value);
                            break;
                        case "outline-color":
                            outlineColor = Color.decode(value);
                            break;
                        case "outline-width":
                            outlineWidth = Float.parseFloat(value);
                            break;
                        default:
                            throw new ConfigException("Invalid setting: " +
                                name);
                    }
                } catch (NumberFormatException exc) {
                    throw new ConfigException("Invalid value for setting " +
                        name, exc);
                } catch (FontFormatException exc) {
                    throw new ConfigException("Invalid font file", exc);
                }
                continue;
            }
            m = MEME_LINE.matcher(line);
            if (m.matches()) {
                String name = m.group(1), description = m.group(2),
                              srcString = m.group(3);
                templates.put(name, new MemeTemplate(name, description,
                    loadImage(new URL(source, srcString))));
                continue;
            }
            throw new ConfigException("Line " + reader.getLineNumber() +
                " is invalid");
        }
        renderer = new MemeRenderer(backgroundImage, rendererFont, textColor,
                                    outlineColor, outlineWidth);
    }

    private static BufferedImage loadImage(URL source) throws IOException {
        return ImageIO.read(source);
    }

}
