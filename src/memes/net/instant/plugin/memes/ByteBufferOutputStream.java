package net.instant.plugin.memes;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;

public class ByteBufferOutputStream extends ByteArrayOutputStream {

    public ByteBufferOutputStream() {
        super();
    }
    public ByteBufferOutputStream(int size) {
        super(size);
    }

    public ByteBuffer toByteBuffer() {
        return ByteBuffer.wrap(buf, 0, count);
    }

}
