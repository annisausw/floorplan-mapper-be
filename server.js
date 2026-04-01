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
import {
  createVerticesSchema,
  updateVerticesSchema,
  deleteVerticesSchema,
} from "./schemas/vertex.schema.js";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 8080;

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// ==========================================
// MULTER (save files to DATA_DIR)
// ==========================================
// Set up Multer to save files directly to our DATA_DIR
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, DATA_DIR);
  },
  filename: (req, file, cb) => {
    // Force the filename to be the map ID
    cb(null, `${req.params.id}.svg`);
  },
});

// Optional: Filter to ensure they only upload SVGs
const fileFilter = (req, file, cb) => {
  if (file.mimetype === "image/svg+xml") {
    cb(null, true);
  } else {
    cb(new Error("Only SVG files are allowed"), false);
  }
};

const upload = multer({ storage, fileFilter });

// ==========================================
// SWAGGER CONFIGURATION (Pure JS Object)
// ==========================================
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Hospital Floorplan Map API",
      version: "1.0.0",
      description:
        "Local API for managing floorplan map vertices, edges, and SVG data.",
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
    // Define all routes here instead of JSDoc comments
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
      },
      "/api/maps/{id}/svg": {
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
      "/api/maps/{id}/vertices": {
        post: {
          tags: ["Vertices"],
          summary: "Create a batch of new vertices",
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
                      slug: {
                        type: "string",
                        example: "f5-wnorth-bed-wards-1",
                      },
                      label: {
                        type: "string",
                        nullable: true,
                        example: "Bed Wards",
                      },
                      floor: { type: "string", example: "5" },
                      wings: {
                        type: "string",
                        nullable: true,
                        example: "North",
                      },
                      "room-type": {
                        type: "string",
                        nullable: true,
                        example: "CLINIC",
                      },
                      keywords: {
                        type: "string",
                        nullable: true,
                        example: "daftar asuransi, bpjs",
                      },
                      aliases: {
                        type: "string",
                        nullable: true,
                        example: "bangsal, kamar rawat inap, ruang pasien",
                      },
                      description: {
                        type: "string",
                        nullable: true,
                        example:
                          "Area kamar bangsal untuk perawatan inap pasien",
                      },
                      type: {
                        type: "string",
                        enum: ["room", "junction"],
                        example: "room",
                      },
                      connection: {
                        type: "array",
                        items: { type: "string" },
                        example: ["j1", "j3"],
                      },
                      cx: { type: "number", example: 640 },
                      cy: { type: "number", example: 406 },
                    },
                    required: [
                      "slug",
                      "floor",
                      "wings",
                      "type",
                      "connection",
                      "cx",
                      "cy",
                    ],
                  },
                },
              },
            },
          },
          responses: { 201: { description: "Vertices created" } },
        },
        put: {
          tags: ["Vertices"],
          summary: "Update a batch of vertices",
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
                schema: { type: "array", items: { type: "object" } },
              },
            },
          },
          responses: { 200: { description: "Vertices updated" } },
        },
        delete: {
          tags: ["Vertices"],
          summary: "Delete a batch of vertices by ID",
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
          responses: { 200: { description: "Vertices deleted" } },
        },
      },
      "/api/maps/{id}/export/graph": {
        get: {
          tags: ["Export"],
          summary: "Export the full routing graph JSON",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Returns Graph format" } },
        },
      },
      "/api/maps/{id}/export/db": {
        get: {
          tags: ["Export"],
          summary: "Export only the room database JSON",
          parameters: [
            {
              in: "path",
              name: "id",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Returns DB format" } },
        },
      },
    },
  },
  // We leave this empty so it stops trying to read the YAML comments in the file
  apis: [],
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ==========================================
// DIRECTORY & FILE SETUP
// ==========================================
const DATA_DIR = path.join(__dirname, "local_map_data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const JWT_SECRET = "super_secret_jwt_key_123!";

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);
if (!fs.existsSync(USERS_FILE))
  fs.writeFileSync(USERS_FILE, JSON.stringify([]));

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const writeJson = (filePath, data) =>
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

// ==========================================
// 1. AUTHENTICATION
// ==========================================

app.post("/api/auth/register", async (req, res) => {
  const { username, password } = req.body;
  const users = readJson(USERS_FILE);

  if (users.find((u) => u.username === username)) {
    return res.status(400).json({ error: "Username already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  users.push({ id: crypto.randomUUID(), username, password: hashedPassword });
  writeJson(USERS_FILE, users);
  res.json({ message: "User registered successfully" });
});

app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;
  const users = readJson(USERS_FILE);
  const user = users.find((u) => u.username === username);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
    expiresIn: "24h",
  });
  res.json({ token, username: user.username });
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
// 2. MAP CREATION & SVG UPLOAD
// ==========================================

// Get all maps for the logged-in user
app.get("/api/maps", authenticateToken, (req, res) => {
  const files = fs.readdirSync(DATA_DIR);
  const maps = [];
  files.forEach((file) => {
    if (file.endsWith(".json") && file !== "users.json") {
      const data = readJson(path.join(DATA_DIR, file));
      if (data.ownerId === req.user.id) {
        maps.push({
          id: data.id,
          name: data.name,
          updatedAt: fs.statSync(path.join(DATA_DIR, file)).mtimeMs,
        });
      }
    }
  });
  res.json(maps);
});

// Create blank map
app.post("/api/maps", authenticateToken, (req, res) => {
  const mapId = crypto.randomUUID();
  const newMap = {
    id: mapId,
    name: req.body.name || "New Floorplan",
    ownerId: req.user.id,
    svgUrl: null,
    vertices: [],
  };
  writeJson(path.join(DATA_DIR, `${mapId}.json`), newMap);
  res.json({ message: "Map created", mapId });
});

// Delete map
app.delete("/api/maps/:id", authenticateToken, (req, res) => {
  const mapFile = path.join(DATA_DIR, `${req.params.id}.json`);
  const svgFile = path.join(DATA_DIR, `${req.params.id}.svg`);

  if (!fs.existsSync(mapFile))
    return res.status(404).json({ error: "Map not found" });

  const mapData = readJson(mapFile);
  if (mapData.ownerId !== req.user.id)
    return res.status(403).json({ error: "Unauthorized" });

  fs.unlinkSync(mapFile);
  if (fs.existsSync(svgFile)) fs.unlinkSync(svgFile);

  res.json({ message: "Map deleted successfully" });
});

app.get("/api/maps/:id", authenticateToken, (req, res) => {
  const filePath = path.join(DATA_DIR, `${req.params.id}.json`);
  if (fs.existsSync(filePath)) {
    res.json(readJson(filePath));
  } else {
    res.status(404).json({ error: "Map not found" });
  }
});

app.post(
  "/api/maps/:id/svg",
  authenticateToken,
  upload.single("svgFile"),
  (req, res) => {
    const mapId = req.params.id;
    const mapFile = path.join(DATA_DIR, `${mapId}.json`);

    if (!fs.existsSync(mapFile)) {
      // Clean up the uploaded file if the map doesn't actually exist
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "Map not found" });
    }

    if (!req.file) {
      return res.status(400).json({
        error:
          "No file uploaded. Please send an SVG file under the key 'svgFile'.",
      });
    }

    // Multer already saved the file to DATA_DIR, so we just update the JSON reference
    const mapData = readJson(mapFile);
    mapData.svgUrl = `http://localhost:${PORT}/data/${req.file.filename}`;
    writeJson(mapFile, mapData);

    res.json({ url: mapData.svgUrl });
  },
);

// ==========================================
// 3. VERTICES OPERATIONS
// ==========================================

app.post("/api/maps/:id/vertices", authenticateToken, (req, res) => {
  const mapFile = path.join(DATA_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(mapFile))
    return res.status(404).json({ error: "Map not found" });

  const parsed = createVerticesSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Validation failed", details: parsed.error.format() });

  const mapData = readJson(mapFile);
  const newlyCreated = [];

  parsed.data.forEach((v) => {
    const newVertex = { ...v, id: crypto.randomUUID() };
    mapData.vertices.push(newVertex);
    newlyCreated.push(newVertex);
  });

  writeJson(mapFile, mapData);
  res
    .status(201)
    .json({ message: "Vertices created successfully", data: newlyCreated });
});

app.put("/api/maps/:id/vertices", authenticateToken, (req, res) => {
  const mapFile = path.join(DATA_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(mapFile))
    return res.status(404).json({ error: "Map not found" });

  const parsed = updateVerticesSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Validation failed", details: parsed.error.format() });

  const mapData = readJson(mapFile);
  const updatedIds = [];

  parsed.data.forEach((updatedV) => {
    const idx = mapData.vertices.findIndex((v) => v.id === updatedV.id);
    if (idx !== -1) {
      mapData.vertices[idx] = { ...mapData.vertices[idx], ...updatedV };
      updatedIds.push(updatedV.id);
    }
  });

  writeJson(mapFile, mapData);
  res.json({ message: "Vertices updated successfully", updatedIds });
});

app.delete("/api/maps/:id/vertices", authenticateToken, (req, res) => {
  const mapFile = path.join(DATA_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(mapFile))
    return res.status(404).json({ error: "Map not found" });

  const parsed = deleteVerticesSchema.safeParse(req.body);
  if (!parsed.success)
    return res
      .status(400)
      .json({ error: "Validation failed", details: parsed.error.format() });

  const mapData = readJson(mapFile);
  const { ids } = parsed.data;

  mapData.vertices = mapData.vertices.filter((v) => !ids.includes(v.id));
  mapData.vertices.forEach((v) => {
    if (v.connection && Array.isArray(v.connection)) {
      v.connection = v.connection.filter((connId) => !ids.includes(connId));
    }
  });

  writeJson(mapFile, mapData);
  res.json({
    message: "Vertices deleted successfully",
    deletedCount: ids.length,
  });
});

// ==========================================
// 4. EXPORT ENDPOINTS
// ==========================================

app.get("/api/maps/:id/export/graph", authenticateToken, (req, res) => {
  const mapFile = path.join(DATA_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(mapFile))
    return res.status(404).json({ error: "Map not found" });

  const mapData = readJson(mapFile);
  const graphExport = mapData.vertices.map((v) => ({
    id: v.id,
    type: v.type,
    label: v.label,
    description: v.description,
    connection: v.connection || [],
    cx: v.cx,
    cy: v.cy,
  }));

  res.json(graphExport);
});

app.get("/api/maps/:id/export/db", authenticateToken, (req, res) => {
  const mapFile = path.join(DATA_DIR, `${req.params.id}.json`);
  if (!fs.existsSync(mapFile))
    return res.status(404).json({ error: "Map not found" });

  const mapData = readJson(mapFile);
  const dbExport = mapData.vertices
    .filter((v) => v.type === "room")
    .map((v) => ({
      id: v.id,
      slug: v.slug,
      label: v.label,
      floor: v.floor,
      wings: v.wings,
      "room-type": v["room-type"],
      keywords: v.keywords,
      aliases: v.aliases,
      description: v.description,
    }));

  res.json(dbExport);
});

// Serve static SVG files
app.use("/data", express.static(DATA_DIR));

app.listen(PORT, () => {
  console.log(`💾 API Server running on http://localhost:${PORT}`);
  console.log(`📖 Swagger Docs available at http://localhost:${PORT}/docs`);
});
