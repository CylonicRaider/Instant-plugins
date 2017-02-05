package net.instant.plugin.client_data;

import java.util.Map;
import java.util.UUID;
import net.instant.api.Message;
import net.instant.api.MessageContents;
import net.instant.api.MessageHook;
import net.instant.api.PresenceChange;
import net.instant.api.RequestResponseData;
import net.instant.api.Utilities;
import org.json.JSONObject;

public class MessageHandler implements MessageHook {

    private final ClientDataManager manager;

    public MessageHandler(ClientDataManager mgr) {
        manager = mgr;
    }

    public void onJoin(PresenceChange change, MessageContents greeting) {
        UUID uuid = getUUID(change.getSource());
        if (uuid != null) manager.refresh(uuid);
    }

    public boolean onMessage(Message message) {
        MessageContents msgd = message.getData();
        UUID uuid;
        String content;
        MessageContents reply;
        switch (msgd.getType()) {
            case "get-cdata":
                uuid = getUUID(message.getSource());
                content = manager.getData(uuid);
                reply = message.makeReply("cdata");
                reply.setData(Utilities.createJSONObject("uuid", uuid,
                                                         "data", content));
                break;
            case "set-cdata":
                uuid = getUUID(message.getSource());
                if (msgd.getData() instanceof JSONObject) {
                    content =
                        ((JSONObject) msgd.getData()).optString("data");
                    if (manager.setData(uuid, content)) {
                        reply = message.makeReply("cdata");
                        reply.setData(Utilities.createJSONObject("uuid", uuid,
                            "data", content));
                    } else {
                        reply = message.makeReply("error");
                        reply.setData(Utilities.createJSONObject("message",
                            "Failed to set client data"));
                    }
                } else {
                    reply = message.makeReply("error");
                    reply.setData(Utilities.createJSONObject("message",
                        "Badly formatted request"));
                }
                break;
            default:
                return false;
        }
        message.getRoom().sendUnicast(message.getSource(), reply);
        return true;
    }

    public void onLeave(PresenceChange change) {
        /* NOP */
    }

    protected static UUID getUUID(RequestResponseData client) {
        Map<String, Object> extra = client.getExtraData();
        return (UUID) extra.get("uuid");
    }

}
