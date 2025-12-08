# TikStreamLink Example Code

This document contains complete example code for the TikStreamLink Minecraft Fabric mod.

## TikStreamLink.java (Main Mod Class)

```java
package com.tikstreamlink;

import net.fabricmc.api.ModInitializer;
import net.fabricmc.fabric.api.event.lifecycle.v1.ServerLifecycleEvents;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.tikstreamlink.api.WebSocketServer;

public class TikStreamLink implements ModInitializer {
    public static final String MOD_ID = "tikstreamlink";
    public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);
    
    private WebSocketServer wsServer;
    
    @Override
    public void onInitialize() {
        LOGGER.info("Initializing TikStreamLink...");
        
        // Register server lifecycle events
        ServerLifecycleEvents.SERVER_STARTED.register(server -> {
            LOGGER.info("Starting WebSocket server...");
            try {
                wsServer = new WebSocketServer(25560, server);
                wsServer.start();
                LOGGER.info("WebSocket server started on port 25560");
            } catch (Exception e) {
                LOGGER.error("Failed to start WebSocket server", e);
            }
        });
        
        ServerLifecycleEvents.SERVER_STOPPING.register(server -> {
            LOGGER.info("Stopping WebSocket server...");
            if (wsServer != null) {
                try {
                    wsServer.stop();
                    LOGGER.info("WebSocket server stopped");
                } catch (Exception e) {
                    LOGGER.error("Error stopping WebSocket server", e);
                }
            }
        });
        
        LOGGER.info("TikStreamLink initialized");
    }
}
```

## WebSocketServer.java

```java
package com.tikstreamlink.api;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import net.minecraft.server.MinecraftServer;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.tikstreamlink.TikStreamLink.LOGGER;

public class WebSocketServer extends WebSocketServer {
    private final MinecraftServer minecraftServer;
    private final Gson gson;
    private final ActionHandler actionHandler;
    
    public WebSocketServer(int port, MinecraftServer server) {
        super(new InetSocketAddress("localhost", port));
        this.minecraftServer = server;
        this.gson = new Gson();
        this.actionHandler = new ActionHandler(server, gson);
    }
    
    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        LOGGER.info("New WebSocket connection from: {}", conn.getRemoteSocketAddress());
        
        // Send available actions
        sendAvailableActions(conn);
    }
    
    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        LOGGER.info("WebSocket connection closed: {} - {}", code, reason);
    }
    
    @Override
    public void onMessage(WebSocket conn, String message) {
        try {
            JsonObject json = gson.fromJson(message, JsonObject.class);
            String type = json.get("type").getAsString();
            
            if ("execute_action".equals(type)) {
                handleExecuteAction(conn, json);
            } else if ("heartbeat".equals(type)) {
                // Acknowledge heartbeat
                sendMessage(conn, "heartbeat", new HashMap<>());
            } else {
                LOGGER.warn("Unknown message type: {}", type);
            }
        } catch (Exception e) {
            LOGGER.error("Error processing message", e);
            sendError(conn, "Failed to process message: " + e.getMessage());
        }
    }
    
    @Override
    public void onError(WebSocket conn, Exception ex) {
        LOGGER.error("WebSocket error", ex);
    }
    
    @Override
    public void onStart() {
        LOGGER.info("WebSocket server started successfully");
    }
    
    private void sendAvailableActions(WebSocket conn) {
        List<Map<String, Object>> actions = new ArrayList<>();
        
        // spawn_entity
        actions.add(createAction("spawn_entity", 
            List.of("entityId", "count", "position")));
        
        // give_item
        actions.add(createAction("give_item", 
            List.of("itemId", "count")));
        
        // set_time
        actions.add(createAction("set_time", 
            List.of("time")));
        
        // apply_potion_effect
        actions.add(createAction("apply_potion_effect", 
            List.of("effectId", "duration", "amplifier")));
        
        // post_chat_message
        actions.add(createAction("post_chat_message", 
            List.of("message")));
        
        // change_weather
        actions.add(createAction("change_weather", 
            List.of("weatherType")));
        
        // execute_command
        actions.add(createAction("execute_command", 
            List.of("command")));
        
        Map<String, Object> data = new HashMap<>();
        data.put("actions", actions);
        
        sendMessage(conn, "available_actions", data);
    }
    
    private Map<String, Object> createAction(String name, List<String> params) {
        Map<String, Object> action = new HashMap<>();
        action.put("name", name);
        action.put("params", params);
        return action;
    }
    
    private void handleExecuteAction(WebSocket conn, JsonObject json) {
        String action = json.get("action").getAsString();
        JsonObject params = json.has("params") ? 
            json.getAsJsonObject("params") : new JsonObject();
        
        LOGGER.info("Executing action: {} with params: {}", action, params);
        
        // Execute action on server thread
        minecraftServer.execute(() -> {
            try {
                String result = actionHandler.handleAction(action, params);
                sendActionResult(conn, true, action, result);
            } catch (Exception e) {
                LOGGER.error("Action execution failed", e);
                sendActionResult(conn, false, action, e.getMessage());
            }
        });
    }
    
    private void sendActionResult(WebSocket conn, boolean success, 
                                  String action, String message) {
        Map<String, Object> data = new HashMap<>();
        data.put("success", success);
        data.put("action", action);
        data.put("message", message);
        data.put("timestamp", System.currentTimeMillis());
        
        sendMessage(conn, "action_result", data);
    }
    
    private void sendError(WebSocket conn, String error) {
        Map<String, Object> data = new HashMap<>();
        data.put("error", error);
        sendMessage(conn, "error", data);
    }
    
    private void sendMessage(WebSocket conn, String type, Map<String, Object> data) {
        Map<String, Object> message = new HashMap<>();
        message.put("type", type);
        message.putAll(data);
        
        String json = gson.toJson(message);
        conn.send(json);
    }
}
```

## ActionHandler.java

```java
package com.tikstreamlink.api;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import net.minecraft.server.MinecraftServer;

public class ActionHandler {
    private final MinecraftServer server;
    private final Gson gson;
    private final GameExecutor executor;
    
    public ActionHandler(MinecraftServer server, Gson gson) {
        this.server = server;
        this.gson = gson;
        this.executor = new GameExecutor(server);
    }
    
    public String handleAction(String action, JsonObject params) throws Exception {
        switch (action) {
            case "spawn_entity":
                return handleSpawnEntity(params);
            
            case "give_item":
                return handleGiveItem(params);
            
            case "set_time":
                return handleSetTime(params);
            
            case "apply_potion_effect":
                return handleApplyPotionEffect(params);
            
            case "post_chat_message":
                return handlePostChatMessage(params);
            
            case "change_weather":
                return handleChangeWeather(params);
            
            case "execute_command":
                return handleExecuteCommand(params);
            
            default:
                throw new IllegalArgumentException("Unknown action: " + action);
        }
    }
    
    private String handleSpawnEntity(JsonObject params) throws Exception {
        String entityId = params.get("entityId").getAsString();
        int count = params.has("count") ? params.get("count").getAsInt() : 1;
        
        executor.spawnEntity(entityId, count);
        return String.format("Spawned %d %s", count, entityId);
    }
    
    private String handleGiveItem(JsonObject params) throws Exception {
        String itemId = params.get("itemId").getAsString();
        int count = params.has("count") ? params.get("count").getAsInt() : 1;
        
        executor.giveItem(itemId, count);
        return String.format("Gave %d %s", count, itemId);
    }
    
    private String handleSetTime(JsonObject params) throws Exception {
        int time = params.get("time").getAsInt();
        
        executor.setTime(time);
        return String.format("Set time to %d", time);
    }
    
    private String handleApplyPotionEffect(JsonObject params) throws Exception {
        String effectId = params.get("effectId").getAsString();
        int duration = params.has("duration") ? params.get("duration").getAsInt() : 30;
        int amplifier = params.has("amplifier") ? params.get("amplifier").getAsInt() : 0;
        
        executor.applyPotionEffect(effectId, duration, amplifier);
        return String.format("Applied %s effect", effectId);
    }
    
    private String handlePostChatMessage(JsonObject params) throws Exception {
        String message = params.get("message").getAsString();
        
        executor.postChatMessage(message);
        return "Posted chat message";
    }
    
    private String handleChangeWeather(JsonObject params) throws Exception {
        String weatherType = params.get("weatherType").getAsString();
        
        executor.changeWeather(weatherType);
        return String.format("Changed weather to %s", weatherType);
    }
    
    private String handleExecuteCommand(JsonObject params) throws Exception {
        String command = params.get("command").getAsString();
        
        executor.executeCommand(command);
        return String.format("Executed command: %s", command);
    }
}
```

## GameExecutor.java

```java
package com.tikstreamlink.api;

import net.minecraft.entity.Entity;
import net.minecraft.entity.EntityType;
import net.minecraft.entity.effect.StatusEffect;
import net.minecraft.entity.effect.StatusEffectInstance;
import net.minecraft.item.Item;
import net.minecraft.item.ItemStack;
import net.minecraft.registry.Registries;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.network.ServerPlayerEntity;
import net.minecraft.server.world.ServerWorld;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.GameRules;

import java.util.List;

import static com.tikstreamlink.TikStreamLink.LOGGER;

public class GameExecutor {
    private final MinecraftServer server;
    
    public GameExecutor(MinecraftServer server) {
        this.server = server;
    }
    
    public void spawnEntity(String entityId, int count) throws Exception {
        ServerPlayerEntity player = getFirstPlayer();
        if (player == null) {
            throw new Exception("No player found");
        }
        
        ServerWorld world = player.getServerWorld();
        Vec3d pos = player.getPos();
        
        Identifier identifier = new Identifier(entityId);
        EntityType<?> entityType = Registries.ENTITY_TYPE.get(identifier);
        
        if (entityType == null) {
            throw new Exception("Invalid entity ID: " + entityId);
        }
        
        for (int i = 0; i < Math.min(count, 50); i++) {
            Entity entity = entityType.create(world);
            if (entity != null) {
                // Spawn near player with slight randomness
                double offsetX = (Math.random() - 0.5) * 5;
                double offsetZ = (Math.random() - 0.5) * 5;
                
                entity.refreshPositionAndAngles(
                    pos.x + offsetX,
                    pos.y,
                    pos.z + offsetZ,
                    0, 0
                );
                
                world.spawnEntity(entity);
            }
        }
        
        LOGGER.info("Spawned {} {}", count, entityId);
    }
    
    public void giveItem(String itemId, int count) throws Exception {
        ServerPlayerEntity player = getFirstPlayer();
        if (player == null) {
            throw new Exception("No player found");
        }
        
        Identifier identifier = new Identifier(itemId);
        Item item = Registries.ITEM.get(identifier);
        
        if (item == null) {
            throw new Exception("Invalid item ID: " + itemId);
        }
        
        ItemStack stack = new ItemStack(item, Math.min(count, 64));
        player.giveItemStack(stack);
        
        LOGGER.info("Gave {} {} to player", count, itemId);
    }
    
    public void setTime(int time) throws Exception {
        ServerWorld overworld = server.getOverworld();
        if (overworld == null) {
            throw new Exception("Overworld not found");
        }
        
        overworld.setTimeOfDay(time);
        LOGGER.info("Set time to {}", time);
    }
    
    public void applyPotionEffect(String effectId, int duration, int amplifier) 
            throws Exception {
        ServerPlayerEntity player = getFirstPlayer();
        if (player == null) {
            throw new Exception("No player found");
        }
        
        Identifier identifier = new Identifier(effectId);
        StatusEffect effect = Registries.STATUS_EFFECT.get(identifier);
        
        if (effect == null) {
            throw new Exception("Invalid effect ID: " + effectId);
        }
        
        StatusEffectInstance effectInstance = new StatusEffectInstance(
            effect,
            duration * 20, // Convert seconds to ticks
            amplifier,
            false,
            true,
            true
        );
        
        player.addStatusEffect(effectInstance);
        LOGGER.info("Applied {} effect to player", effectId);
    }
    
    public void postChatMessage(String message) throws Exception {
        Text text = Text.literal(message);
        server.getPlayerManager().broadcast(text, false);
        LOGGER.info("Posted chat message: {}", message);
    }
    
    public void changeWeather(String weatherType) throws Exception {
        ServerWorld overworld = server.getOverworld();
        if (overworld == null) {
            throw new Exception("Overworld not found");
        }
        
        switch (weatherType.toLowerCase()) {
            case "clear":
                overworld.setWeather(6000, 0, false, false);
                break;
            case "rain":
                overworld.setWeather(0, 6000, true, false);
                break;
            case "thunder":
                overworld.setWeather(0, 6000, true, true);
                break;
            default:
                throw new Exception("Invalid weather type: " + weatherType);
        }
        
        LOGGER.info("Changed weather to {}", weatherType);
    }
    
    public void executeCommand(String command) throws Exception {
        server.getCommandManager().executeWithPrefix(
            server.getCommandSource(),
            command
        );
        LOGGER.info("Executed command: {}", command);
    }
    
    private ServerPlayerEntity getFirstPlayer() {
        List<ServerPlayerEntity> players = server.getPlayerManager().getPlayerList();
        return players.isEmpty() ? null : players.get(0);
    }
}
```

## Configuration Example

### ModConfig.java

```java
package com.tikstreamlink.config;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import java.io.File;
import java.io.FileReader;
import java.io.FileWriter;

public class ModConfig {
    public WebSocketConfig websocket = new WebSocketConfig();
    public SecurityConfig security = new SecurityConfig();
    public LimitsConfig limits = new LimitsConfig();
    
    public static class WebSocketConfig {
        public boolean enabled = true;
        public int port = 25560;
        public String host = "localhost";
    }
    
    public static class SecurityConfig {
        public String[] allowedHosts = {"localhost", "127.0.0.1"};
        public boolean requireAuth = false;
    }
    
    public static class LimitsConfig {
        public int maxEntitiesPerSpawn = 50;
        public int maxItemsPerGive = 64;
        public int commandCooldown = 1000;
    }
    
    public static ModConfig load(File configFile) {
        if (!configFile.exists()) {
            ModConfig config = new ModConfig();
            config.save(configFile);
            return config;
        }
        
        try (FileReader reader = new FileReader(configFile)) {
            Gson gson = new Gson();
            return gson.fromJson(reader, ModConfig.class);
        } catch (Exception e) {
            return new ModConfig();
        }
    }
    
    public void save(File configFile) {
        try (FileWriter writer = new FileWriter(configFile)) {
            Gson gson = new GsonBuilder().setPrettyPrinting().create();
            gson.toJson(this, writer);
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
```

## Notes

- All game operations must run on the server thread via `server.execute()`
- Validate all inputs before executing
- Implement proper error handling
- Add rate limiting for security
- Log all actions for debugging
- Use the first player in the list as the target player
- Limit entity spawning to prevent server lag

## Testing

Use the following WebSocket test client to verify the mod works:

```javascript
const ws = new WebSocket('ws://localhost:25560');

ws.onopen = () => {
    console.log('Connected');
};

ws.onmessage = (event) => {
    console.log('Received:', event.data);
};

// Test spawning entities
ws.send(JSON.stringify({
    type: 'execute_action',
    action: 'spawn_entity',
    params: {
        entityId: 'minecraft:sheep',
        count: 5
    }
}));
```
