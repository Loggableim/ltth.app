# Building the TikStreamLink Fabric Mod

## Development Environment Setup

### Prerequisites

1. **JDK 17 or newer**
   - Download from [Adoptium](https://adoptium.net/)
   - Set JAVA_HOME environment variable

2. **IntelliJ IDEA or Eclipse** (recommended)
   - IntelliJ IDEA Community Edition is free
   - Install with Java support

3. **Fabric Development Template**
   - Clone from: https://github.com/FabricMC/fabric-example-mod
   - Or use Fabric template generator

## Project Structure

```
tikstreamlink/
├── src/
│   └── main/
│       ├── java/
│       │   └── com/
│       │       └── tikstreamlink/
│       │           ├── TikStreamLink.java          # Main mod class
│       │           ├── api/
│       │           │   ├── WebSocketServer.java    # WebSocket server
│       │           │   ├── ActionHandler.java      # Command handler
│       │           │   └── GameExecutor.java       # Game operations
│       │           └── config/
│       │               └── ModConfig.java          # Configuration
│       └── resources/
│           ├── fabric.mod.json                     # Mod metadata
│           └── tikstreamlink.mixins.json          # Mixin config
├── build.gradle                                    # Build configuration
└── gradle.properties                               # Gradle properties
```

## build.gradle

```gradle
plugins {
    id 'fabric-loom' version '1.5-SNAPSHOT'
    id 'maven-publish'
}

version = project.mod_version
group = project.maven_group

base {
    archivesName = project.archives_base_name
}

repositories {
    maven {
        url 'https://repo.maven.apache.org/maven2/'
    }
}

dependencies {
    // Minecraft and Fabric
    minecraft "com.mojang:minecraft:${project.minecraft_version}"
    mappings "net.fabricmc:yarn:${project.yarn_mappings}:v2"
    modImplementation "net.fabricmc:fabric-loader:${project.loader_version}"
    modImplementation "net.fabricmc.fabric-api:fabric-api:${project.fabric_version}"

    // WebSocket library
    include implementation('org.java-websocket:Java-WebSocket:1.5.4')
    
    // JSON processing
    include implementation('com.google.code.gson:gson:2.10.1')
}

processResources {
    inputs.property "version", project.version

    filesMatching("fabric.mod.json") {
        expand "version": project.version
    }
}

tasks.withType(JavaCompile).configureEach {
    it.options.release = 17
}

java {
    withSourcesJar()

    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

jar {
    from("LICENSE") {
        rename { "${it}_${project.base.archivesName.get()}"}
    }
}
```

## gradle.properties

```properties
# Minecraft Properties
minecraft_version=1.20.4
yarn_mappings=1.20.4+build.3
loader_version=0.15.6

# Fabric API
fabric_version=0.96.0+1.20.4

# Mod Properties
mod_version=1.0.0
maven_group=com.tikstreamlink
archives_base_name=tikstreamlink
```

## fabric.mod.json

```json
{
  "schemaVersion": 1,
  "id": "tikstreamlink",
  "version": "${version}",
  "name": "TikStreamLink",
  "description": "Real-time TikTok Live integration for Minecraft",
  "authors": [
    "Your Name"
  ],
  "contact": {
    "homepage": "https://github.com/yourusername/tikstreamlink",
    "sources": "https://github.com/yourusername/tikstreamlink"
  },
  "license": "CC-BY-NC-4.0",
  "icon": "assets/tikstreamlink/icon.png",
  "environment": "*",
  "entrypoints": {
    "main": [
      "com.tikstreamlink.TikStreamLink"
    ],
    "server": [
      "com.tikstreamlink.TikStreamLink"
    ]
  },
  "mixins": [
    "tikstreamlink.mixins.json"
  ],
  "depends": {
    "fabricloader": ">=0.15.0",
    "fabric-api": "*",
    "minecraft": "~1.20.4",
    "java": ">=17"
  }
}
```

## Example Code Structure

### TikStreamLink.java (Main Class)

See `EXAMPLE_CODE.md` for the full implementation.

### WebSocketServer.java

See `EXAMPLE_CODE.md` for the full implementation.

### GameExecutor.java

See `EXAMPLE_CODE.md` for the full implementation.

## Building the Mod

### Using Gradle

1. **Clean build**
   ```bash
   ./gradlew clean
   ```

2. **Build JAR**
   ```bash
   ./gradlew build
   ```

3. **Find output**
   - JAR file will be in `build/libs/`
   - File name: `tikstreamlink-1.0.0.jar`

### Using IDE

**IntelliJ IDEA:**
1. Import project as Gradle project
2. Wait for Gradle sync to complete
3. Run Gradle task: `build`
4. Find JAR in `build/libs/`

**Eclipse:**
1. Import as Gradle project
2. Right-click project → Gradle → Refresh Gradle Project
3. Run Gradle task: `build`
4. Find JAR in `build/libs/`

## Testing the Mod

### In Development

1. **Run Minecraft client**
   ```bash
   ./gradlew runClient
   ```

2. **Run Minecraft server**
   ```bash
   ./gradlew runServer
   ```

### In Production

1. Copy JAR to `.minecraft/mods/` folder
2. Launch Minecraft with Fabric
3. Check logs for "TikStreamLink initialized"
4. Test WebSocket connection from TikTok tool

## Configuration

Create `config/tikstreamlink.json`:

```json
{
  "websocket": {
    "enabled": true,
    "port": 25560,
    "host": "localhost"
  },
  "security": {
    "allowedHosts": ["localhost", "127.0.0.1"],
    "requireAuth": false
  },
  "limits": {
    "maxEntitiesPerSpawn": 50,
    "maxItemsPerGive": 64,
    "commandCooldown": 1000
  }
}
```

## Troubleshooting

### Common Build Errors

**OutOfMemoryError:**
- Increase heap size: `./gradlew build -Xmx2G`

**Dependency resolution failed:**
- Clear Gradle cache: `./gradlew clean --refresh-dependencies`

**Mixin compilation errors:**
- Verify Fabric API version matches Minecraft version
- Check mixin configuration in `tikstreamlink.mixins.json`

### Runtime Issues

**Mod not loading:**
- Check `fabric.mod.json` syntax
- Verify Java version (17+)
- Check Fabric Loader compatibility

**WebSocket not starting:**
- Check port availability
- Verify firewall settings
- Check server logs for errors

## Advanced Features

### Adding Custom Actions

1. Add action handler in `ActionHandler.java`
2. Update `GameExecutor.java` with implementation
3. Add to available actions list in `WebSocketServer.java`

### Performance Optimization

- Use async operations where possible
- Implement action queuing
- Add rate limiting
- Cache frequently used data

### Security Enhancements

- Add authentication tokens
- Implement IP whitelist
- Add command validation
- Implement user permissions

## Publishing

### To Modrinth

1. Create account on Modrinth
2. Create new project
3. Upload JAR file
4. Add description and images

### To CurseForge

1. Create account on CurseForge
2. Create new Minecraft mod project
3. Upload JAR file
4. Configure project details

## License

CC BY-NC 4.0 License - see LICENSE file for details

## Support

For help building or using this mod:
- Check the main documentation
- Review example code
- Create an issue on GitHub
- Join the Discord community
