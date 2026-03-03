import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import User from "./models/User.js";

dotenv.config();

const app = express();

// 🔥 Required for Railway reverse proxy
app.set("trust proxy", 1);

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  }),
);

app.use(express.json());

// ✅ Health check route
app.get("/", (req, res) => {
  res.status(200).send("ExpresSit Backend Running 🚀");
});

const server = http.createServer(app);

// ✅ Stable Socket.IO config for Railway
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

// 🔥 Connect MongoDB + Start Server
const startServer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log("MongoDB Connected");

    io.on("connection", (socket) => {
      console.log("User connected:", socket.id);

      // Real-time online count
      io.emit("onlineCount", io.engine.clientsCount);

      socket.on("startChat", async ({ name, age, gender, preference }) => {
        try {
          const existingMatch = await User.findOne({
            isMatched: false,
            gender:
              preference === "both" ? { $in: ["boy", "girl"] } : preference,
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
