import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./config/db.js";
import User from "./models/User.js";

dotenv.config();

// 🔥 Connect DB safely
connectDB().catch((err) => {
  console.error("MongoDB connection failed:", err);
  process.exit(1);
});

const app = express();

// ✅ IMPORTANT for Railway proxy
app.set("trust proxy", 1);

// ✅ CORS
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  }),
);

app.use(express.json());

// ✅ Health Check Route (Railway needs this)
app.get("/", (req, res) => {
  res.status(200).send("ExpresSit Backend Running 🚀");
});

const server = http.createServer(app);

// ✅ Production-safe Socket.IO config
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"], // fallback support
  allowEIO3: true,
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // 🔥 Online users count
  io.emit("onlineCount", io.engine.clientsCount);

  socket.on("startChat", async ({ name, age, gender, preference }) => {
    try {
      const existingMatch = await User.findOne({
        isMatched: false,
        gender: preference === "both" ? { $in: ["boy", "girl"] } : preference,
        $or: [{ preference: "both" }, { preference: gender }],
      });

      if (existingMatch) {
        const roomId = existingMatch.socketId + socket.id;
        const chatStartTime = Date.now();

        existingMatch.isMatched = true;
        existingMatch.roomId = roomId;
        await existingMatch.save();

        await User.create({
          socketId: socket.id,
          name,
          age,
          gender,
          preference,
          isMatched: true,
          roomId,
        });

        socket.join(roomId);

        const oldSocket = io.sockets.sockets.get(existingMatch.socketId);
        if (oldSocket) oldSocket.join(roomId);

        socket.emit("matched", {
          roomId,
          partnerName: existingMatch.name,
          partnerAge: existingMatch.age,
          chatStartTime,
        });

        io.to(existingMatch.socketId).emit("matched", {
          roomId,
          partnerName: name,
          partnerAge: age,
          chatStartTime,
        });

        console.log("Users matched:", roomId);
      } else {
        await User.create({
          socketId: socket.id,
          name,
          age,
          gender,
          preference,
          isMatched: false,
        });

        socket.emit("searching");
        console.log("User searching:", socket.id);
      }
    } catch (err) {
      console.error("Matching error:", err);
    }
  });

  socket.on("sendMessage", ({ roomId, message }) => {
    socket.to(roomId).emit("receiveMessage", message);
  });

  socket.on("disconnect", async () => {
    try {
      await User.deleteOne({ socketId: socket.id });
    } catch (err) {
      console.error("Cleanup error:", err);
    }

    io.emit("onlineCount", io.engine.clientsCount);
    console.log("User disconnected:", socket.id);
  });
});

// 🔥 CRITICAL for Railway
const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
