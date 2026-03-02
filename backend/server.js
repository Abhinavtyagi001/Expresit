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
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // 🔥 Real-time accurate online users count
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

        // Join both users to room
        socket.join(roomId);
        const oldSocket = io.sockets.sockets.get(existingMatch.socketId);
        if (oldSocket) oldSocket.join(roomId);

        // Send partner details to both
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

        console.log("Users matched in room:", roomId);
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
        console.log("User waiting for match:", socket.id);
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

    // 🔥 Update online count on disconnect
    io.emit("onlineCount", io.engine.clientsCount);

    console.log("User disconnected:", socket.id);
  });
});

server.listen(5000, () => console.log("Server running on port 5000"));
