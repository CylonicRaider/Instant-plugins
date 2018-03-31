package net.instant.plugin.memes;

import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.Shape;
import java.awt.font.FontRenderContext;
import java.awt.font.LineBreakMeasurer;
import java.awt.font.TextLayout;
import java.awt.geom.AffineTransform;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.text.AttributedCharacterIterator;
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
            // TODO: Adjust for bounds.getX().
            Rectangle2D bounds = text.getBounds();
            return new Line(text, (float) (width - bounds.getWidth()) / 2,
                            y);
        }

    }

    private final BufferedImage image;
    private final String text;

    public MemeComponent(BufferedImage image, String text) {
        this.image = image;
        this.text = text;
    }

    public BufferedImage getImage() {
        return image;
    }

    public String getText() {
        return text;
    }

    public void render(MemeRenderer parent, Graphics2D g, Rectangle r,
                       float valign) {
        g.drawImage(image,
                    r.x, r.y, r.x + r.width, r.y + r.height,
                    r.x, r.y, r.x + r.width, r.y + r.height,
                    null);
        if (text.isEmpty()) return;
        // Now the fun part, find a font size at which the entire text fits
        // into the rectangle.
        AttributedCharacterIterator chars =
            new AttributedString(text).getIterator();
        Font origFont = g.getFont();
        float fontSize = origFont.getSize();
        List<Line> lines;
        do {
            g.setFont(origFont.deriveFont(fontSize));
            fontSize -= 1;
            if (fontSize <= 0) return;
            lines = typeset(chars, g.getFontRenderContext(),
                            r.width, r.height);
        } while (lines == null);
        // And draw the resulting lines.
        AffineTransform tr = g.getTransform();
        for (Line l : lines) {
            Shape shape = l.getText().getOutline(null);
            g.setTransform(tr);
            g.translate(l.getX(), l.getY());
            g.setColor(parent.getTextColor());
            g.fill(shape);
            if (parent.getOutlineColor() != null) {
                g.setColor(parent.getOutlineColor());
                g.draw(shape);
            }
        }
        g.setTransform(tr);
        g.setFont(origFont);
    }

    private List<Line> typeset(AttributedCharacterIterator chars,
                               FontRenderContext ctx,
                               float width, float maxHeight) {
        LineBreakMeasurer measurer = new LineBreakMeasurer(chars, ctx);
        List<Line> ret = new ArrayList<Line>();
        float y = 0.0f;
        while (measurer.getPosition() < chars.getEndIndex()) {
            TextLayout item = measurer.nextLayout(width);
            if (ret.isEmpty()) y += item.getAscent();
            Line l = Line.centered(item, width, y);
            if (l.getBottom() > maxHeight) return null;
            ret.add(l);
            y += item.getLeading();
        }
        return ret;
    }

}
