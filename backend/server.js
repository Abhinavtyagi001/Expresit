import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import User from "./models/User.js";

dotenv.config();

const app = express();
app.set("trust proxy", 1);

app.use(cors({ origin: "*", methods: ["GET", "POST"] }));
app.use(express.json());

// ✅ Health route (Railway checks this)
app.get("/", (req, res) => {
  res.status(200).send("Backend Running");
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  transports: ["polling"], // 🔥 IMPORTANT (temporary fix)
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  io.emit("onlineCount", io.engine.clientsCount);

  socket.on("disconnect", () => {
    io.emit("onlineCount", io.engine.clientsCount);
    console.log("User disconnected:", socket.id);
  });
});

// ✅ Start ONLY after DB connects
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log("MongoDB Connected");

    const PORT = process.env.PORT || 5000;

    server.listen(PORT, "0.0.0.0", () => {
      console.log("Server running on port", PORT);
    });
  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
};

startServer();
