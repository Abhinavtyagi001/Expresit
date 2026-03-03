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

// 🔥 IMPORTANT: Add your Vercel domain here
const allowedOrigins = [
  "https://expresit-pb55.vercel.app", // your frontend
  "http://localhost:5173", // local dev
];

// ✅ Proper CORS (NOT "*")
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS not allowed"));
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  }),
);

app.use(express.json());

// ✅ Health check
app.get("/", (req, res) => {
  res.status(200).send("Backend Alive");
});

const server = http.createServer(app);

// ✅ Socket.io config (MATCH CORS ABOVE)
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["polling"], // Railway safe
});

// ✅ Start server immediately
const PORT = process.env.PORT || 5000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});

// ✅ Connect Mongo separately (non-blocking)
mongoose
  .connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  })
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.error("MongoDB error:", err));

// ================= SOCKET LOGIC =================

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

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
      console.error("Match error:", err);
    }
  });

  socket.on("sendMessage", ({ roomId, message }) => {
    socket.to(roomId).emit("receiveMessage", message);
  });

  socket.on("disconnect", async () => {
    try {
      await User.deleteOne({ socketId: socket.id });
    } catch (err) {}

    io.emit("onlineCount", io.engine.clientsCount);
    console.log("User disconnected:", socket.id);
  });
});
