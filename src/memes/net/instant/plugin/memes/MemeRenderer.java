package net.instant.plugin.memes;

import java.awt.BasicStroke;
import java.awt.Color;
import java.awt.Font;
import java.awt.Graphics2D;
import java.awt.Rectangle;
import java.awt.RenderingHints;
import java.awt.image.BufferedImage;
import java.awt.image.ColorModel;
import java.awt.image.WritableRaster;

public class MemeRenderer {

    private final BufferedImage background;
    private final Font font;
    private final Color textColor;
    private final Color outlineColor;
    private final float outlineWidth;

    public MemeRenderer(BufferedImage background, Font font, Color textColor,
                        Color outlineColor, float outlineWidth) {
        if (background == null || font == null || textColor == null)
            throw new NullPointerException();
        this.background = background;
        this.font = font;
        this.textColor = textColor;
        this.outlineColor = outlineColor;
        this.outlineWidth = outlineWidth;
    }

    public BufferedImage getBackground() {
        return background;
    }

    public Font getFont() {
        return font;
    }

    public Color getTextColor() {
        return textColor;
    }

    public Color getOutlineColor() {
        return outlineColor;
    }

    public float getOutlineWidth() {
        return outlineWidth;
    }

    public void ensureCompatible(MemeComponent component) {
        if (component.getImage().getWidth() != background.getWidth() ||
                component.getImage().getHeight() != background.getHeight())
            throw new RuntimeException("Meme component does not match " +
                "meme renderer");
    }

    // TODO: Support more than two parts.
    public BufferedImage render(MemeComponent top, MemeComponent bottom) {
        BufferedImage result = duplicate(background);
        Graphics2D g = result.createGraphics();
        try {
            g.setStroke(new BasicStroke(outlineWidth));
            g.setFont(font);
            g.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
                               RenderingHints.VALUE_ANTIALIAS_ON);
            int w = result.getWidth(), h = result.getHeight();
            if (top != null) {
                ensureCompatible(top);
                top.render(this, g, new Rectangle(0, 0, w, h / 2), 0.0f);
            }
            if (bottom != null) {
                ensureCompatible(bottom);
                bottom.render(this, g, new Rectangle(0, h / 2, w, h - h / 2),
                              1.0f);
            }
        } finally {
            g.dispose();
        }
        return result;
    }

    // WARNING: Does supposedly not copy subimages correctly.
    public static BufferedImage duplicate(BufferedImage input) {
        ColorModel model = input.getColorModel();
        WritableRaster raster = input.copyData(null);
        return new BufferedImage(model, raster, model.isAlphaPremultiplied(),
                                 null);
    }

}
