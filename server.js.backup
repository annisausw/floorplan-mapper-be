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

// --- Updated Schemas ---
const graphNodeSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, enum: ["room", "junction"] },
    connection: [String],
    cx: Number,
    cy: Number,
  },
  { _id: false },
);

const roomBaseSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    slug: String,
    label: String,
    floor: String,
    wings: String,
    "room-type": String,
    keywords: String,
    aliases: String,
    description_id: String,
    description_en: String,
  },
  { _id: false },
);

const mapSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: String,
    ownerId: String,
    svgUrl: String,
    canvasW: { type: Number, default: 1500 },
    canvasH: { type: Number, default: 1000 },
    graph: [graphNodeSchema], // The Spatial Data
    rooms: [roomBaseSchema], // The Metadata
  },
  { timestamps: true },
);

const routeImageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    mapId: { type: String, required: true },
    fromNode: { type: String, required: true },
    toNode: { type: String, required: true },
    fileName: { type: String, required: true },
    url: String,
    path: [String], // Stores the actual node IDs found during pathfinding
  },
  { timestamps: true },
);

const RouteImage = mongoose.model("RouteImage", routeImageSchema);

const MapDoc = mongoose.model("Map", mapSchema);

// --- Helper to merge data for the Frontend ---
const formatMap = (doc) => {
  const obj = doc.toObject();
  const vertices = obj.graph.map((node) => {
    // If it's a room, find its metadata and merge it
    if (node.type === "room") {
      const meta = obj.rooms.find((r) => r.id === node.id) || {};
      return { ...node, ...meta };
    }
    return node;
  });
  return { ...obj, vertices, graph: undefined, rooms: undefined };
};

// ==========================================
// 2. MULTER (Save SVG Backgrounds locally)
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
                schema: {
                  type: "object",
                  properties: {
                    username: { type: "string" },
                    password: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "User registered successfully" } },
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
                schema: {
                  type: "object",
                  properties: {
                    username: { type: "string" },
                    password: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Login successful" } },
        },
      },
      "/api/maps": {
        get: {
          tags: ["Maps"],
          summary: "Get all maps for the logged-in user",
          responses: { 200: { description: "Returns array of maps" } },
        },
        post: {
          tags: ["Maps"],
          summary: "Create a new blank map",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { name: { type: "string" } },
                },
              },
            },
          },
          responses: { 200: { description: "Map created" } },
        },
      },
      "/api/maps/{id}": {
        get: {
          tags: ["Maps"],
          summary: "Get a map by ID",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Returns map JSON" } },
        },
        delete: {
          tags: ["Maps"],
          summary: "Delete a map and its SVG by ID",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Map deleted" } },
        },
      },
      "/api/maps/{id}/svg": {
        get: {
          tags: ["Maps"],
          summary: "Get protected SVG",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          produces: ["image/svg+xml"], // Add this
          responses: {
            200: {
              description: "SVG File",
              content: {
                "image/svg+xml": {
                  schema: { type: "string", format: "binary" }, // Explicitly set binary
                },
              },
            },
          },
        },
        post: {
          tags: ["Maps"],
          summary: "Upload SVG file for the map background",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: { svgFile: { type: "string", format: "binary" } },
                },
              },
            },
          },
          responses: { 200: { description: "SVG uploaded" } },
        },
      },
      "/api/maps/{id}/crop": {
        post: {
          tags: ["Maps"],
          summary: "Generate a high-res cropped PNG of a specific route path",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    from: { type: "string", description: "Start node ID" },
                    to: { type: "string", description: "End node ID" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Returns URL of PNG" } },
        },
      },
      "/api/maps/{id}/rooms": {
        get: {
          tags: ["Rooms"],
          summary: "Get all room metadata",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Returns array of room metadata" } },
        },
        post: {
          tags: ["Rooms"],
          summary: "Add new room metadata entries",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      slug: { type: "string" },
                      label: { type: "string" },
                      floor: { type: "string" },
                      wings: { type: "string" },
                      "room-type": { type: "string" },
                      keywords: { type: "string" },
                      aliases: { type: "string" },
                      description_id: { type: "string" },
                      description_en: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Room metadata added" } },
        },
        put: {
          tags: ["Rooms"],
          summary: "Full sync/overwrite of room metadata",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    rooms: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Rooms overwritten" } },
        },
      },
      "/api/maps/{id}/graph": {
        get: {
          tags: ["Graph"],
          summary: "Get all spatial nodes (junctions and room coordinates)",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Returns array of graph nodes" } },
        },
        post: {
          tags: ["Graph"],
          summary: "Add new spatial nodes to the graph",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      type: { type: "string", enum: ["room", "junction"] },
                      connection: { type: "array", items: { type: "string" } },
                      cx: { type: "number" },
                      cy: { type: "number" },
                    },
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Graph nodes added" } },
        },
        put: {
          tags: ["Graph"],
          summary: "Full sync/overwrite of the spatial graph",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    graph: { type: "array", items: { type: "object" } },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Graph overwritten" } },
        },
      },

      // --- PROTECTED ASSETS ---
      "/api/maps/{id}/svg": {
        get: {
          tags: ["Assets"],
          summary: "Get protected SVG background",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "SVG File Stream",
              content: {
                "image/svg+xml": {
                  schema: { type: "string", format: "binary" },
                },
              },
            },
          },
        },
      },
      "/api/routes/image/{fileName}": {
        get: {
          tags: ["Assets"],
          summary: "Retrieve a generated route PNG",
          parameters: [
            {
              in: "path",
              name: "fileName",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "PNG Image Stream",
              content: {
                "image/png": { schema: { type: "string", format: "binary" } },
              },
            },
          },
        },
      },

      // --- UNIFIED DELETE (Still needed to remove from both at once) ---
      "/api/maps/{id}/vertices": {
        delete: {
          tags: ["Unified"],
          summary: "Delete nodes from both Graph and Rooms by ID",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    ids: { type: "array", items: { type: "string" } },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Nodes removed everywhere" } },
        },
      },
      "/api/maps/{id}/export/graph": {
        get: {
          tags: ["Export"],
          summary: "Export raw graph JSON",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Returns graph array" } },
        },
      },
      "/api/maps/{id}/export/db": {
        get: {
          tags: ["Export"],
          summary: "Export raw room database JSON",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Returns rooms array" } },
        },
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
app.get("/api/maps", authenticateToken, async (req, res) => {
  try {
    const maps = await MapDoc.find({ ownerId: req.user.id }).sort({
      updatedAt: -1,
    });
    res.json(
      maps.map((m) => ({
        id: m.id,
        name: m.name,
        updatedAt: m.updatedAt.getTime(),
      })),
    );
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch maps" });
  }
});

app.post("/api/maps", authenticateToken, async (req, res) => {
  try {
    const mapId = crypto.randomUUID();
    await MapDoc.create({
      id: mapId,
      name: req.body.name || "New Floorplan",
      ownerId: req.user.id,
      svgUrl: null,
      canvasW: 1500,
      canvasH: 1000,
      vertices: [],
    });
    res.json({ message: "Map created", mapId });
  } catch (err) {
    res.status(500).json({ error: "Failed to create map" });
  }
});

app.delete("/api/maps/:id", authenticateToken, async (req, res) => {
  try {
    const map = await MapDoc.findOne({ id: req.params.id });
    if (!map) return res.status(404).json({ error: "Map not found" });
    if (map.ownerId !== req.user.id)
      return res.status(403).json({ error: "Unauthorized" });

    await MapDoc.deleteOne({ id: req.params.id });
    const svgFile = path.join(DATA_DIR, `${req.params.id}.svg`);
    if (fs.existsSync(svgFile)) fs.unlinkSync(svgFile);

    res.json({ message: "Map deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete map" });
  }
});

app.get("/api/maps/:id", authenticateToken, async (req, res) => {
  try {
    const map = await MapDoc.findOne({ id: req.params.id });
    if (!map) return res.status(404).json({ error: "Map not found" });
    res.json(formatMap(map));
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch map" });
  }
});

/**
 * GET: Protected SVG Map Background
 */
app.get("/api/maps/:id/svg", authenticateToken, async (req, res) => {
  try {
    const map = await MapDoc.findOne({ id: req.params.id });
    if (!map) return res.status(404).json({ error: "Map not found" });

    if (map.ownerId !== req.user.id) {
      return res.status(403).json({ error: "Unauthorized access" });
    }

    // Ensure the path is Absolute
    const svgPath = path.resolve(DATA_DIR, `${req.params.id}.svg`);

    if (!fs.existsSync(svgPath)) {
      return res.status(404).json({ error: "SVG file not found" });
    }

    res.setHeader("Content-Type", "image/svg+xml");

    // Use a callback to catch streaming errors
    res.sendFile(svgPath, (err) => {
      if (err) {
        console.error("Error sending file:", err);
        if (!res.headersSent) {
          res.status(500).send("Error downloading file");
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post(
  "/api/maps/:id/svg",
  authenticateToken,
  upload.single("svgFile"),
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
// 5. SERVER-SIDE IMAGE CROP GENERATION
// ==========================================
/**
 * BFS Pathfinding Helper
 * Finds the shortest path between two IDs using the graph connections.
 */
function findPath(graph, startId, endId) {
  const queue = [[startId]];
  const visited = new Set([startId]);

  while (queue.length > 0) {
    const path = queue.shift();
    const node = path[path.length - 1];

    if (node === endId) return path;

    const graphNode = graph.find((n) => n.id === node);
    if (graphNode && graphNode.connection) {
      for (const neighbor of graphNode.connection) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push([...path, neighbor]);
        }
      }
    }
  }
  return null;
}

app.post("/api/maps/:id/crop", authenticateToken, async (req, res) => {
  try {
    const map = await MapDoc.findOne({ id: req.params.id });
    if (!map) return res.status(404).json({ error: "Map not found" });

    const { from, to } = req.body;
    if (!from || !to)
      return res.status(400).json({ error: "Missing from/to IDs" });

    // 1. Pathfinding
    const routePath = findPath(map.graph, from, to);
    if (!routePath) return res.status(404).json({ error: "Path not found" });

    // 2. Prepare Data
    const allVertices = formatMap(map).vertices;
    const pathNodes = allVertices.filter((n) => routePath.includes(n.id));

    // 3. File Type Detection & REAL Metadata Extraction
    const bgPathSvg = path.resolve(DATA_DIR, `${req.params.id}.svg`);
    const bgPathPng = path.resolve(DATA_DIR, `${req.params.id}.png`);
    let bgPath = fs.existsSync(bgPathPng)
      ? bgPathPng
      : fs.existsSync(bgPathSvg)
        ? bgPathSvg
        : null;

    if (!bgPath)
      return res.status(404).json({ error: "Background image not found" });

    const isPng = bgPath.endsWith(".png");
    const DENSITY = isPng ? 72 : 300;
    const SCALE = DENSITY / 72;

    // FIX: Get ACTUAL dimensions of the file on disk to prevent "Out of Bounds" errors
    const metadata = await sharp(
      bgPath,
      !isPng ? { density: DENSITY } : {},
    ).metadata();
    const actualPixelWidth = metadata.width;
    const actualPixelHeight = metadata.height;

    // 4. Boundary Calculation (Logical Coordinates)
    const padding = 50;
    const minX = Math.max(0, Math.min(...pathNodes.map((n) => n.cx)) - padding);
    const minY = Math.max(0, Math.min(...pathNodes.map((n) => n.cy)) - padding);

    // Ensure logical crop doesn't exceed stored canvas bounds
    const maxX = Math.min(
      map.canvasW,
      Math.max(...pathNodes.map((n) => n.cx)) + padding,
    );
    const maxY = Math.min(
      map.canvasH,
      Math.max(...pathNodes.map((n) => n.cy)) + padding,
    );

    const logicalWidth = maxX - minX;
    const logicalHeight = maxY - minY;

    // 5. Final Pixel Coordinate Validation
    // Calculate final pixel extract parameters
    let extractLeft = Math.round(minX * SCALE);
    let extractTop = Math.round(minY * SCALE);
    let extractWidth = Math.round(logicalWidth * SCALE);
    let extractHeight = Math.round(logicalHeight * SCALE);

    // Safety Check: Clamp to actual pixel dimensions to prevent Sharp crashes
    if (extractLeft + extractWidth > actualPixelWidth) {
      extractWidth = actualPixelWidth - extractLeft;
    }
    if (extractTop + extractHeight > actualPixelHeight) {
      extractHeight = actualPixelHeight - extractTop;
    }

    // 5. Generate Overlay SVG (Markers and Path)
    let highlightEdges = "";
    let markers = "";
    const routeEdges = new Set();
    for (let i = 0; i < routePath.length - 1; i++) {
      const [a, b] = [routePath[i], routePath[i + 1]].sort();
      routeEdges.add(`${a}_to_${b}`);
    }

    allVertices.forEach((v) => {
      // Draw the Green Path
      if (Array.isArray(v.connection)) {
        v.connection.forEach((targetId) => {
          const [a, b] = [v.id, targetId].sort();
          if (routeEdges.has(`${a}_to_${b}`)) {
            const target = allVertices.find((vx) => vx.id === targetId);
            if (target) {
              highlightEdges += `<line x1="${v.cx}" y1="${v.cy}" x2="${target.cx}" y2="${target.cy}" stroke="#10b981" stroke-width="2" stroke-linecap="round" />`;
            }
          }
        });
      }

      // Draw Start/Goal Markers
      const isStart = v.id === from;
      const isEnd = v.id === to;
      if (isStart || isEnd) {
        const color = isStart ? "#3b82f6" : "#ef4444";
        const role = isStart ? "start" : "goal";
        const roomName = v.label || v.slug || "Point";
        if (isStart) {
          markers += `
            <g transform="translate(${v.cx - 7}, ${v.cy - 7}) scale(0.5)">
              <circle cx="14" cy="14" r="14" fill="${color}" stroke="white" stroke-width="2" />
            </g>
            <text x="${v.cx}" y="${v.cy - 15}" text-anchor="middle" font-size="10" font-family="Poppins, Arial, sans-serif" font-weight="800" fill="black">${roomName}</text>
            <text x="${v.cx}" y="${v.cy - 25}" text-anchor="middle" font-size="8" font-family="Poppins, Arial, sans-serif" font-weight="600" fill="black" opacity="0.7">${role}</text>`;
        } else {
          markers += `
            <g transform="translate(${v.cx - 10}, ${v.cy - 22.5}) scale(0.5)">
              <path d="M20,40 C20,40 34,26 34,16 A14,14 0 1,0 6,16 C6,26 20,40 20,40 Z" fill="${color}" stroke="white" stroke-width="2" />
              <circle cx="20" cy="16" r="5" fill="white" />
            </g>
            <text x="${v.cx}" y="${v.cy - 25}" text-anchor="middle" font-size="10" font-family="Poppins, Arial, sans-serif" font-weight="800" fill="black">${roomName}</text>
            <text x="${v.cx}" y="${v.cy - 35}" text-anchor="middle" font-size="8" font-family="Poppins, Arial, sans-serif" font-weight="600" fill="black" opacity="0.7">${role}</text>`;
        }
      }
    });

    const overlaySvg = Buffer.from(`
      <svg width="${logicalWidth}" height="${logicalHeight}" viewBox="${minX} ${minY} ${logicalWidth} ${logicalHeight}" xmlns="http://www.w3.org/2000/svg">
        <style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@800&amp;display=swap');</style>
        ${highlightEdges}
        ${markers}
      </svg>`);

    // 7. High-Res Compositing
    const fileName = `route_${crypto.randomUUID()}.png`;
    const outPath = path.resolve(DATA_DIR, fileName);

    const croppedBgBuffer = await sharp(
      bgPath,
      isPng ? {} : { density: DENSITY },
    )
      .extract({
        left: extractLeft,
        top: extractTop,
        width: extractWidth,
        height: extractHeight,
      })
      .toBuffer();

    const overlayBuffer = await sharp(overlaySvg, {
      density: DENSITY,
    }).toBuffer();

    await sharp(croppedBgBuffer)
      .composite([{ input: overlayBuffer, blend: "over" }])
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .png()
      .toFile(outPath);

    // 8. Store Result
    const routeEntry = await RouteImage.create({
      id: crypto.randomUUID(),
      mapId: req.params.id,
      fromNode: from,
      toNode: to,
      path: routePath,
      fileName: fileName,
    });

    res.json({
      url: `http://localhost:${PORT}/api/routes/image/${fileName}`,
      data: routeEntry,
    });
  } catch (err) {
    console.error("Detailed Crop error:", err);
    res.status(500).json({ error: "Generation failed", details: err.message });
  }
});

app.get("/api/routes/image/:fileName", authenticateToken, async (req, res) => {
  const filePath = path.resolve(DATA_DIR, req.params.fileName);
  if (!fs.existsSync(filePath))
    return res.status(404).json({ error: "Image not found" });

  res.setHeader("Content-Type", "image/png");
  res.sendFile(filePath);
});

// ==========================================
// 6. GRAPH & ROOM OPERATIONS (SEPARATED CRUD)
// ==========================================

/**
 * 6A. GRAPH OPERATIONS
 * Handles spatial data (id, type, connection, cx, cy)
 */
app.get("/api/maps/:id/graph", authenticateToken, async (req, res) => {
  try {
    const map = await MapDoc.findOne({ id: req.params.id });
    if (!map) return res.status(404).json({ error: "Map not found" });
    res.json(map.graph || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch graph" });
  }
});

app.post("/api/maps/:id/graph", authenticateToken, async (req, res) => {
  try {
    const incomingGraph = Array.isArray(req.body) ? req.body : [req.body];
    const map = await MapDoc.findOneAndUpdate(
      { id: req.params.id, ownerId: req.user.id },
      { $push: { graph: { $each: incomingGraph } } },
      { new: true },
    );
    if (!map) return res.status(404).json({ error: "Map not found" });
    res.status(201).json({ message: "Graph nodes added successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to add graph nodes" });
  }
});

app.put("/api/maps/:id/graph", authenticateToken, async (req, res) => {
  try {
    const { graph } = req.body;
    const map = await MapDoc.findOne({
      id: req.params.id,
      ownerId: req.user.id,
    });
    if (!map)
      return res.status(404).json({ error: "Map not found or unauthorized" });

    map.graph = graph || [];
    map.markModified("graph");
    await map.save();
    res.json({ message: "Graph spatial data synced successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to sync graph" });
  }
});

/**
 * 6B. ROOM OPERATIONS
 * Handles metadata (slug, label, floor, wings, descriptions, etc.)
 */
app.get("/api/maps/:id/rooms", authenticateToken, async (req, res) => {
  try {
    const map = await MapDoc.findOne({ id: req.params.id });
    if (!map) return res.status(404).json({ error: "Map not found" });
    res.json(map.rooms || []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch room metadata" });
  }
});

app.post("/api/maps/:id/rooms", authenticateToken, async (req, res) => {
  try {
    const incomingRooms = Array.isArray(req.body) ? req.body : [req.body];
    // Security: Filter to ensure we only save room metadata
    const map = await MapDoc.findOneAndUpdate(
      { id: req.params.id, ownerId: req.user.id },
      { $push: { rooms: { $each: incomingRooms } } },
      { new: true },
    );
    if (!map) return res.status(404).json({ error: "Map not found" });
    res.status(201).json({ message: "Room metadata added successfully" });
  } catch (err) {
    res.status(500).json({ error: "Failed to add room metadata" });
  }
});

app.put("/api/maps/:id/rooms", authenticateToken, async (req, res) => {
  try {
    // Check if rooms is inside an object or is the body itself
    const roomsData =
      req.body.rooms || (Array.isArray(req.body) ? req.body : []);

    const map = await MapDoc.findOneAndUpdate(
      { id: req.params.id, ownerId: req.user.id },
      { $set: { rooms: roomsData } },
      { returnDocument: "after" }, // Modern replacement for { new: true }
    );

    if (!map)
      return res.status(404).json({ error: "Map not found or unauthorized" });

    res.json({ message: "Room metadata synced successfully" });
  } catch (err) {
    console.error("Sync Error Detail:", err); // Log the actual error to your terminal
    res
      .status(500)
      .json({ error: "Failed to sync rooms", details: err.message });
  }
});

/**
 * 6C. UNIFIED OPERATIONS
 * These remain for backward compatibility with App4.tsx
 */
// DELETE: Removes from both arrays and cleans connections
app.delete("/api/maps/:id/vertices", authenticateToken, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids))
      return res.status(400).json({ error: "Invalid IDs" });

    const map = await MapDoc.findOne({
      id: req.params.id,
      ownerId: req.user.id,
    });
    if (!map) return res.status(404).json({ error: "Map not found" });

    map.graph = map.graph.filter((v) => !ids.includes(v.id));
    map.rooms = map.rooms.filter((r) => !ids.includes(r.id));

    // Clean connections in remaining graph nodes
    map.graph.forEach((v) => {
      if (v.connection) {
        v.connection = v.connection.filter((connId) => !ids.includes(connId));
      }
    });

    map.markModified("graph");
    map.markModified("rooms");
    await map.save();
    res.json({ message: "Deleted successfully", deletedCount: ids.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete" });
  }
});

// ==========================================
// 7. EXPORT ENDPOINTS (UPDATED FOR SEPARATED SCHEMA)
// ==========================================

app.get("/api/maps/:id/export/graph", authenticateToken, async (req, res) => {
  try {
    const map = await MapDoc.findOne({ id: req.params.id });
    if (!map) return res.status(404).json({ error: "Map not found" });
    // Export raw graph data
    res.json(map.graph);
  } catch (err) {
    res.status(500).json({ error: "Failed to export graph" });
  }
});

app.get("/api/maps/:id/export/db", authenticateToken, async (req, res) => {
  try {
    const map = await MapDoc.findOne({ id: req.params.id });
    if (!map) return res.status(404).json({ error: "Map not found" });
    // Export raw metadata data
    res.json(map.rooms);
  } catch (err) {
    res.status(500).json({ error: "Failed to export db" });
  }
});

app.use("/data", express.static(DATA_DIR));

app.listen(PORT, () => {
  console.log(`💾 API Server running on http://localhost:${PORT}`);
  console.log(`📖 Swagger Docs available at http://localhost:${PORT}/docs`);
});
