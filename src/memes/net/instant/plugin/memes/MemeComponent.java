package net.instant.plugin.memes;

import java.awt.BasicStroke;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.Shape;
import java.awt.Stroke;
import java.awt.font.FontRenderContext;
import java.awt.font.LineBreakMeasurer;
import java.awt.font.TextAttribute;
import java.awt.font.TextLayout;
import java.awt.geom.AffineTransform;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.text.AttributedString;
import java.util.ArrayList;
import java.util.List;

public class MemeComponent {

    // TODO: Use display-related API-s instead of measurement-related ones.
    private static class Line {

        private final TextLayout text;
        private final float x;
        private final float y;

        public Line(TextLayout text, float x, float y) {
            this.text = text;
            this.x = x;
            this.y = y;
        }

        public TextLayout getText() {
            return text;
        }

        public float getX() {
            return x;
        }

        public float getY() {
            return y;
        }

        public float getTop() {
            return y - text.getAscent();
        }

        public float getBottom() {
            return y + text.getDescent();
        }

        public static Line centered(TextLayout text, float width, float y) {
            Rectangle2D bounds = text.getBounds();
            double x = (width - bounds.getWidth()) / 2  - bounds.getX();
            return new Line(text, (float) x, y);
        }

    }

    /* According to the heading comment of the sun.font.FontDesignMetrics
     * class (TODO: find better reference), as default, Java assumes 72 ppi,
     * so that a pixel is also a (typographical) point (which is defined to
     * be 1/72 inch). Comparison of pixel sizes of characters rendered by
     * this code and a Web browser (which uses CSS units, which in turn
     * assume 96 ppi) confirms the hypothesis. */
    private static final float PIXELS_PER_POINT = 1.0f;

    /* Padding around the text as a fraction of the width (vertically) /
     * height (horizontally) of the display rectangle. */
    private static final float TEXT_INSETS = 0.05f;

    private final BufferedImage image;
    private final String text;
    private final boolean flipped;

    public MemeComponent(BufferedImage image, String text, boolean flipped) {
        this.image = image;
        this.text = text;
        this.flipped = flipped;
    }
    public MemeComponent(BufferedImage image, String text) {
        this(image, text, false);
    }

    public BufferedImage getImage() {
        return image;
    }

    public String getText() {
        return text;
    }

    public boolean isFlipped() {
        return flipped;
    }

    public void render(MemeRenderer parent, Graphics2D g, Rectangle r,
                       float valign) {
        int dl = r.x, dr = r.x;
        if (flipped) {
            dl += r.width;
        } else {
            dr += r.width;
        }
        g.drawImage(image,
                    dl,  r.y, dr,            r.y + r.height,
                    r.x, r.y, r.x + r.width, r.y + r.height,
                    null);
        if (text.isEmpty()) return;
        // Avoid text coming too close to the edges.
        r = new Rectangle((int) (r.x + r.width * TEXT_INSETS),
                          (int) (r.y + r.height * TEXT_INSETS),
                          (int) (r.width * (1 - TEXT_INSETS * 2)),
                          (int) (r.height * (1 - TEXT_INSETS * 2)));
        // Now the fun part, find a font size at which the entire text fits
        // into the rectangle.
        Font origFont = g.getFont();
        float fontSize = origFont.getSize();
        List<Line> lines;
        do {
            g.setFont(origFont.deriveFont(fontSize));
            lines = typeset(text, g.getFont(), g.getFontRenderContext(),
                (fontSize < parent.getWrappingCutoff()), r.width, r.height);
            fontSize -= 1;
            if (fontSize <= 0) return;
        } while (lines == null);
        // Vertically align it.
        // The text is adjusted to have its top at y=0.
        float textHeight = lines.get(lines.size() - 1).getBottom();
        float yshift = (r.height - textHeight) * valign;
        // And draw the resulting text.
        Stroke origStroke = g.getStroke();
        g.setStroke(new BasicStroke(fontSize * PIXELS_PER_POINT *
            parent.getOutlineFactor()));
        AffineTransform tr = g.getTransform();
        for (Line l : lines) {
            Shape shape = l.getText().getOutline(null);
            g.setTransform(tr);
            g.translate(r.x + l.getX(), r.y + yshift + l.getY());
            g.setColor(parent.getTextColor());
            g.fill(shape);
            if (parent.getOutlineColor() != null) {
                g.setColor(parent.getOutlineColor());
                g.draw(shape);
            }
        }
        g.setTransform(tr);
        g.setStroke(origStroke);
        g.setFont(origFont);
    }

    private static List<Line> typeset(String text, Font font,
            FontRenderContext ctx, boolean breakWords, float width,
            float maxHeight) {
        AttributedString chars = new AttributedString(text);
        chars.addAttribute(TextAttribute.FONT, font);
        LineBreakMeasurer measurer = new LineBreakMeasurer(
            chars.getIterator(), ctx);
        List<Line> ret = new ArrayList<Line>();
        float y = 0.0f;
        while (measurer.getPosition() < text.length()) {
            TextLayout item = measurer.nextLayout(width, text.length(),
                ! breakWords);
            if (item == null) return null;
            if (ret.isEmpty()) y += item.getAscent();
            Line l = Line.centered(item, width, y);
            if (l.getBottom() > maxHeight) return null;
            ret.add(l);
            y += item.getAscent() + item.getDescent() + item.getLeading();
        }
        return ret;
    }

}
