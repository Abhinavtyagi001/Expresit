import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import cors from "cors";
import connectDB from "./config/db.js";
import User from "./models/User.js";

dotenv.config();
connectDB();

const app = express();

// ✅ Better CORS for production
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
  }),
);

app.use(express.json());

// ✅ Health check route (VERY IMPORTANT for Railway)
app.get("/", (req, res) => {
  res.status(200).send("ExpresSit Backend Running");
});

const server = http.createServer(app);

// ✅ Proper socket config
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
  transports: ["websocket", "polling"],
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // 🔥 Real-time online count
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
    await User.deleteOne({ socketId: socket.id });
    io.emit("onlineCount", io.engine.clientsCount);
    console.log("User disconnected:", socket.id);
  });
});

// ✅ CRITICAL: Railway dynamic port
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
