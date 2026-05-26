import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import swaggerUi from "swagger-ui-express";
import swaggerJsdoc from "swagger-jsdoc";
import multer from "multer";
import mongoose from "mongoose";
import sharp from "sharp";
import { createServer } from "http";
import { Server } from "socket.io";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8080;

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ==========================================
// 1. MONGODB CONNECTION & SCHEMAS
// ==========================================
if (!process.env.MONGO_URL) {
  console.error("🔴 Fatal Error: MONGO_URL is not defined in .env file.");
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URL)
  .then(() => console.log("🟢 Connected to MongoDB Database"))
  .catch((err) => console.error("🔴 MongoDB connection error:", err));

// A. User Model
const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});
const User = mongoose.model("User", userSchema);

const nodeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, enum: ["room", "junction"], required: true },
    floor: Number,
    cx: Number,
    cy: Number,
    connection: [String],
    // Room specific fields
    slug: String,
    objectName: String, 
    label: String,
    categoryId: String,
    wings: String,
    aliases: [String],  
    keywords: [String], 
    description_id: String,
    description_en: String,
  },
  { _id: false }
);

const mapSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: String,
    hospitalId: { type: String, required: true },
    hospitalName: String,
    buildingId: { type: String, required: true },
    buildingName: String,
    svgUrl: String,
    canvasW: { type: Number, default: 1500 },
    canvasH: { type: Number, default: 1000 },
    nodes: [nodeSchema],
  },
  { timestamps: true }
);

const MapDoc = mongoose.model("Map", mapSchema);

// ==========================================
// 2. MULTER (Save SVG Backgrounds locally)
// (change to: upload assets in bucket)
// ==========================================
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

const storage = multer.diskStorage({
  destination: "data/",
  filename: (req, file, cb) => {
    const ext = file.originalname.split(".").pop().toLowerCase();
    // Use the ID from the URL parameters instead of Date.now()
    cb(null, `${req.params.id}.${ext}`);
  },
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Check for common image types
    const allowedTypes = [
      "image/svg+xml",
      "image/png",
      "image/jpeg",
      "image/jpg",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      // This is the error you were seeing!
      cb(new Error("Only SVG, PNG, and JPG files are allowed"), false);
    }
  },
});

// ==========================================
// SWAGGER CONFIGURATION
// ==========================================
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Hospital Floorplan Map API",
      version: "1.0.0",
      description:
        "Local API for managing floorplan map vertices, edges, SVG data, and MongoDB storage.",
    },
    servers: [{ url: `http://localhost:${PORT}` }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            username: { type: "string", example: "admin_hospital" },
            password: { type: "string", example: "SecurePass123!" },
          },
          required: ["username", "password"],
        },
        Node: {
          type: "object",
          required: ["id", "type"],
          properties: {
            id: { type: "string", example: "room_101" },
            type: { type: "string", enum: ["room", "junction"], example: "room" },
            floor: { type: "number", example: 1 },
            cx: { type: "number", example: 450.5 },
            cy: { type: "number", example: 230.1 },
            connection: { type: "array", items: { type: "string" }, example: ["junc_01", "room_102"] },
            slug: { type: "string", example: "icu-ward-1" },
            objectName: { type: "string", example: "ICU_Room" },
            label: { type: "string", example: "Intensive Care Unit" },
            categoryId: { type: "string", example: "cat_critical" },
            wings: { type: "string", example: "North Wing" },
            aliases: { type: "array", items: { type: "string" }, example: ["Emergency Room", "ICU"] },
            keywords: { type: "array", items: { type: "string" }, example: ["critical", "surgery", "bed"] },
            description_id: { type: "string", example: "Unit Perawatan Intensif" },
            description_en: { type: "string", example: "Intensive Care Unit Facility" },
          },
        },
        Map: {
          type: "object",
          properties: {
            id: { type: "string", example: "a3b89c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d" },
            name: { type: "string", example: "Floor 1 - Main Ward" },
            hospitalId: { type: "string", example: "hosp_001" },
            hospitalName: { type: "string", example: "General Hospital" },
            buildingId: { type: "string", example: "bld_main" },
            buildingName: { type: "string", example: "Medical Complex Building" },
            svgUrl: { type: "string", nullable: true, example: "http://localhost:8080/data/map_id.svg" },
            canvasW: { type: "number", example: 1122.6667 },
            canvasH: { type: "number", example: 793.33331 },
            nodes: { type: "array", items: { $ref: "#/components/schemas/Node" } },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    paths: {
      "/api/auth/register": {
        post: {
          tags: ["Auth"],
          summary: "Register a new user",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
          },
          responses: { 
            200: { description: "User registered successfully" },
            400: { description: "Username already exists" },
            500: { description: "Server error" }
          },
        },
      },
      "/api/auth/login": {
        post: {
          tags: ["Auth"],
          summary: "Login and get JWT token",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/User" },
              },
            },
          },
          responses: { 
            200: { 
              description: "Login successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      token: { type: "string" },
                      username: { type: "string" }
                    }
                  }
                }
              }
            },
            401: { description: "Invalid credentials" },
            500: { description: "Server error" }
          },
        },
      },
      "/api/maps": {
        get: {
          tags: ["Maps"],
          summary: "Get all maps filtered by context hierarchy",
          parameters: [
            { in: "query", name: "hospitalId", required: false, schema: { type: "string" } },
            { in: "query", name: "buildingId", required: false, schema: { type: "string" } }
          ],
          responses: { 
            200: { 
              description: "Returns minimized collection array of maps",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string" },
                        name: { type: "string" },
                        updatedAt: { type: "number" }
                      }
                    }
                  }
                }
              }
            },
            500: { description: "Failed to fetch maps" }
          },
        },
        post: {
          tags: ["Maps"],
          summary: "Create a new blank structural map with relational layout hierarchy",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["hospitalId", "buildingId"],
                  properties: { 
                    name: { type: "string" },
                    hospitalId: { type: "string" },
                    hospitalName: { type: "string" },
                    buildingId: { type: "string" },
                    buildingName: { type: "string" }
                  },
                },
              },
            },
          },
          responses: { 
            201: { 
              description: "Map created successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      mapId: { type: "string" },
                      map: { $ref: "#/components/schemas/Map" }
                    }
                  }
                }
              }
            },
            400: { description: "Hospital and Building IDs are required" },
            500: { description: "Failed to create map" }
          },
        },
      },
      "/api/maps/{id}": {
        get: {
          tags: ["Maps"],
          summary: "Get a comprehensive map by ID",
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "string" } },
          ],
          responses: { 
            200: { 
              description: "Returns full unified map JSON structure",
              content: { "application/json": { schema: { $ref: "#/components/schemas/Map" } } }
            },
            404: { description: "Map not found" },
            500: { description: "Failed to fetch map" }
          },
        },
        delete: {
          tags: ["Maps"],
          summary: "Delete a map record along with its local graphics vector assets",
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "string" } },
          ],
          responses: { 
            200: { description: "Map and localized file media deleted successfully" },
            403: { description: "Unauthorized access restriction matching ownership metadata" },
            404: { description: "Map target context identifier not found" },
            500: { description: "Failed to delete map" }
          },
        },
      },
      "/api/maps/{id}/background": {
        post: {
          tags: ["Maps"],
          summary: "Upload image data (SVG, PNG, JPG) to process map dimensions and layout backgrounds",
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["file"],
                  properties: { file: { type: "string", format: "binary" } },
                },
              },
            },
          },
          responses: { 
            200: { 
              description: "File uploaded successfully. Returns URL and computed aspect dimension data",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      url: { type: "string" },
                      canvasW: { type: "number" },
                      canvasH: { type: "number" }
                    }
                  }
                }
              }
            },
            400: { description: "Bad dataset input parameter or file allocation structure missing" },
            404: { description: "Associated parent spatial map item not found" },
            500: { description: "Intermittent internal asset computational compilation processing error" }
          },
        },
      },
      "/api/maps/{id}/nodes": {
        get: {
          tags: ["Nodes"],
          summary: "Fetch all structural system graph node properties for a designated map structure",
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "string" } },
          ],
          responses: { 
            200: { 
              description: "Returns absolute layout array containing junctions and room descriptors",
              content: { "application/json": { schema: { type: "array", items: { $ref: "#/components/schemas/Node" } } } }
            },
            404: { description: "Map identity could not be isolated" },
            500: { description: "Failure executing graph processing query loop" }
          },
        },
        put: {
          tags: ["Nodes"],
          summary: "Overwrite transactional execution parameters to synch map canvas nodes structure completely",
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["nodes"],
                  properties: {
                    nodes: { type: "array", items: { $ref: "#/components/schemas/Node" } }
                  }
                }
              },
            },
          },
          responses: { 
            200: { description: "Global layout map configuration points updated successfully" },
            404: { description: "Map targeted execution resource profile missing" },
            500: { description: "Failed to synchronization structural data elements securely" }
          },
        },
        delete: {
          tags: ["Nodes"],
          summary: "Removes explicit data node parameters by identity matching loops and scrub reference mappings",
          parameters: [
            { in: "path", name: "id", required: true, schema: { type: "string" } },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["ids"],
                  properties: {
                    ids: { type: "array", items: { type: "string" }, example: ["room_101", "junc_55"] }
                  }
                }
              }
            }
          },
          responses: {
            200: { description: "Target items stripped clean and dependency connections decoupled successfully" },
            404: { description: "Target context profile not found" },
            500: { description: "Entity operation removal workflow execution error encountered" }
          }
        }
      },
    },
  },
  apis: [],
};
app.use(
  "/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerJsdoc(swaggerOptions)),
);

// ==========================================
// 3. AUTHENTICATION ENDPOINTS
// ==========================================
const JWT_SECRET = "super_secret_jwt_key_123!";

app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, password } = req.body;
    const existing = await User.findOne({ username });
    if (existing)
      return res.status(400).json({ error: "Username already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({
      id: crypto.randomUUID(),
      username,
      password: hashedPassword,
    });
    res.json({ message: "User registered successfully" });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: "24h" },
    );
    res.json({ token, username: user.username });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"]?.split(" ")[1];
  if (!token)
    return res.status(401).json({ error: "Access denied, token missing" });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token" });
    req.user = user;
    next();
  });
};

// ==========================================
// 4. MAP CREATION & SVG UPLOAD (DYNAMIC SIZE FIX)
// ==========================================
// --- GET: Fetch all maps with hospital/building context ---
app.get("/api/maps", authenticateToken, async (req, res) => {
  try {
    const { hospitalId, buildingId } = req.query;
    
    // Create a filter object based on query params
    const filter = {};
    if (hospitalId) filter.hospitalId = hospitalId;
    if (buildingId) filter.buildingId = buildingId;

    const maps = await MapDoc.find(filter).sort({ updatedAt: -1 });
    
    res.json(maps.map((m) => ({
      id: m.id,
      name: m.name, // This matches your floor names (e.g., "Floor 1")
      updatedAt: m.updatedAt.getTime(),
      // Include any other data needed for the card
    })));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch maps", details: err.message });
  }
});

// --- POST: Create map with hierarchy ---
app.post("/api/maps", authenticateToken, async (req, res) => {
  try {
    const { 
      name, 
      hospitalId, 
      hospitalName, 
      buildingId, 
      buildingName 
    } = req.body;

    if (!hospitalId || !buildingId) {
      return res.status(400).json({ error: "Hospital and Building IDs are required." });
    }

    const newMap = await MapDoc.create({
      id: crypto.randomUUID(),
      name: name || "New Floorplan",
      hospitalId,
      hospitalName: hospitalName || "Unknown Hospital",
      buildingId,
      buildingName: buildingName || "Main Building",
      svgUrl: null,
      canvasW: 1122.6667, // Updated to match your example JSON defaults
      canvasH: 793.33331,
      nodes: [] 
    });

    res.status(201).json({ 
      message: "Map created successfully", 
      mapId: newMap.id,
      map: newMap 
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to create map", details: err.message });
  }
});

app.delete("/api/maps/:id", authenticateToken, async (req, res) => {
  try {
    const map = await MapDoc.findOne({ id: req.params.id });
    if (!map) return res.status(404).json({ error: "Map not found" });
    if (map.ownerId !== req.user.id)
      return res.status(403).json({ error: "Unauthorized" });

    await MapDoc.deleteOne({ id: req.params.id });
    const file = path.join(DATA_DIR, `${req.params.id}.svg`);
    if (fs.existsSync(file)) fs.unlinkSync(file);

    res.json({ message: "Map deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete map" });
  }
});

app.get("/api/maps/:id", authenticateToken, async (req, res) => {
  try {
    const map = await MapDoc.findOne({ id: req.params.id });
    
    if (!map) return res.status(404).json({ error: "Map not found" });
    
    // Adjusted to return the full Unified Structure
    res.json({
      id: map.id,
      name: map.name,
      hospitalId: map.hospitalId,
      hospitalName: map.hospitalName,
      buildingId: map.buildingId,
      buildingName: map.buildingName,
      svgUrl: map.svgUrl,
      canvasW: map.canvasW,
      canvasH: map.canvasH,
      nodes: map.nodes || [], 
      createdAt: map.createdAt,
      updatedAt: map.updatedAt
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch map", details: err.message });
  }
});



app.post(
  "/api/maps/:id/background",
  authenticateToken,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ error: "No file uploaded." });

      const map = await MapDoc.findOne({ id: req.params.id });
      if (!map) {
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: "Map not found" });
      }

      const fileExt = req.file.originalname.split(".").pop().toLowerCase();

      // CLEANUP: If uploading a PNG, check if an old SVG exists and delete it (and vice versa)
      const otherExt = fileExt === "svg" ? "png" : "svg";
      const oldFile = path.resolve(DATA_DIR, `${req.params.id}.${otherExt}`);
      if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);

      let newW = 1500;
      let newH = 1000;

      if (fileExt === "svg") {
        const svgContent = fs.readFileSync(req.file.path, "utf8");
        const vbMatch = svgContent.match(
          /viewBox=["']\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)["']/i,
        );
        if (vbMatch) {
          newW = parseFloat(vbMatch[1]);
          newH = parseFloat(vbMatch[2]);
        }
      } else {
        const metadata = await sharp(req.file.path).metadata();
        newW = metadata.width || 1500;
        newH = metadata.height || 1000;
      }

      // Update the database with the new fixed filename
      map.svgUrl = `http://localhost:${PORT}/data/${req.params.id}.${fileExt}`;
      map.canvasW = newW;
      map.canvasH = newH;
      await map.save();

      res.json({ url: map.svgUrl, canvasW: newW, canvasH: newH });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Failed to process image." });
    }
  },
);

// ==========================================
// 6. NODES OPERATIONS 
// ==========================================

// GET: Fetch all nodes for a map (Global access)
app.get("/api/maps/:id/nodes", authenticateToken, async (req, res) => {
  try {
    const map = await MapDoc.findOne({ id: req.params.id });
    if (!map) return res.status(404).json({ error: "Map not found" });
    res.json(map.nodes || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch nodes" });
  }
});

// PUT: Full Sync (Global overwrite)
app.put("/api/maps/:id/nodes", authenticateToken, async (req, res) => {
  try {
    const { nodes } = req.body;
    const map = await MapDoc.findOneAndUpdate(
      { id: req.params.id },
      { $set: { nodes: nodes || [] } },
      { new: true }
    );
    if (!map) return res.status(404).json({ error: "Map not found" });
    res.json({ message: "Global map nodes updated successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to sync nodes" });
  }
});

app.delete("/api/maps/:id/nodes", authenticateToken, async (req, res) => {
  try {
    const { ids } = req.body; 
    const map = await MapDoc.findOne({ id: req.params.id });
    
    if (!map) return res.status(404).json({ error: "Map not found" });

    // Filter out the deleted nodes
    map.nodes = map.nodes.filter((n) => !ids.includes(n.id));

    // Cleanup stale connections
    map.nodes.forEach((n) => {
      if (n.connection) {
        n.connection = n.connection.filter((connId) => !ids.includes(connId));
      }
    });

    map.markModified("nodes");
    await map.save();
    res.json({ message: "Nodes deleted globally", deletedCount: ids.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete nodes" });
  }
});

// ==========================================
// 8. SESSION ENDPOINTS (PEER TO PEER COLLABORATION)
// ==========================================
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { 
    origin: "http://localhost:5173", 
    methods: ["GET", "POST"],
    credentials: true
   }
});

// Registry to track: { socketId: { mapId, username, peerId } }
const activeUsers = new Map();

io.on("connection", (socket) => {
  socket.on("join-map", ({ mapId, username, peerId }) => {
    socket.join(mapId);
    activeUsers.set(socket.id, { mapId, username, peerId });

    // Tell everyone in the room to update their peer connections
    const usersInRoom = Array.from(activeUsers.values()).filter(u => u.mapId === mapId);
    io.to(mapId).emit("room-presence-update", usersInRoom);
  });

  socket.on("disconnect", () => {
    const user = activeUsers.get(socket.id);
    if (user) {
      activeUsers.delete(socket.id);
      const usersInRoom = Array.from(activeUsers.values()).filter(u => u.mapId === user.mapId);
      io.to(user.mapId).emit("room-presence-update", usersInRoom);
    }
  });
});

app.use("/data", express.static(DATA_DIR));

// IMPORTANT: Change app.listen to httpServer.listen
httpServer.listen(PORT, () => {
  console.log(`🚀 Server + Collaboration running on port ${PORT}`);
});
