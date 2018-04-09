package net.instant.plugin.memes;

import java.awt.image.BufferedImage;

public class MemeTemplate {

    private final String name;
    private final String description;
    private final BufferedImage image;

    public MemeTemplate(String name, String description,
                        BufferedImage image) {
        if (name == null || image == null)
            throw new NullPointerException();
        this.name = name;
        this.description = description;
        this.image = image;
    }

    public String getName() {
        return name;
    }

    public String getDescription() {
        return description;
    }

    public BufferedImage getImage() {
        return image;
    }

    public MemeComponent createComponent(String text, boolean flip) {
        return new MemeComponent(image, text, flip);
    }
    public MemeComponent createComponent(String text) {
        return createComponent(text, false);
    }

}
