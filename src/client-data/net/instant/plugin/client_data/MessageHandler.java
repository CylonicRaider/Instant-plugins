package net.instant.plugin.client_data;

import java.util.Map;
import java.util.UUID;
import net.instant.api.Message;
import net.instant.api.MessageContents;
import net.instant.api.MessageHook;
import net.instant.api.PresenceChange;
import net.instant.api.RequestResponseData;
import org.json.JSONObject;

public class MessageHandler implements MessageHook {

    private final ClientDataManager manager;

    public MessageHandler(ClientDataManager mgr) {
        manager = mgr;
    }

    public void onConnect(PresenceChange change, MessageContents greeting) {
        UUID uuid = getUUID(change.getSource());
        if (uuid != null) manager.refresh(uuid);
    }

    public boolean onMessage(Message message) {
        MessageContents msgd = message.getData();
        UUID uuid;
        String content;
        MessageContents response;
        switch (msgd.getType()) {
            case "get-cdata":
                uuid = getUUID(message.getSource());
                response = message.makeMessage("cdata")
                    .withData("uuid", uuid, "data", manager.getData(uuid));
                break;
            case "set-cdata":
                uuid = getUUID(message.getSource());
                if (msgd.getData() instanceof JSONObject) {
                    JSONObject cData = (JSONObject) msgd.getData();
                    content = cData.optString("data", null);
                    if (manager.setData(uuid, content)) {
                        response = message.makeMessage("cdata")
                            .withData("uuid", uuid, "data", content);
                    } else {
                        response = message.makeMessage("error")
                            .withData("code", "CLDATA_UPD", "message",
                                      "Failed to set client data");
                    }
                } else {
                    response = message.makeMessage("error")
                        .withData("code", "CLDATA_BADREQ", "message",
                                  "Badly formatted request");
                }
                break;
            default:
                return false;
        }
        message.sendResponse(response);
        return true;
    }

    public void onDisconnect(PresenceChange change) {
        /* NOP */
    }

    protected static UUID getUUID(RequestResponseData client) {
        Map<String, Object> extra = client.getExtraData();
        return (UUID) extra.get("uuid");
    }

}
