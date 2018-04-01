package net.instant.plugin.memes;

import java.awt.image.BufferedImage;

public class MemeTemplate {

    private final String name;
    private final String description;
    private final BufferedImage image;

    public MemeTemplate(String name, String description,
                        BufferedImage image) {
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

    public MemeComponent createComponent(String text) {
        return new MemeComponent(image, text);
    }

}
