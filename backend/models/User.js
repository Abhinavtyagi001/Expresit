import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  socketId: String,
  name: String,
  age: Number,
  gender: String, // boy / girl
  preference: String, // boy / girl / both
  isMatched: {
    type: Boolean,
    default: false,
  },
  roomId: String,
});

export default mongoose.model("User", userSchema);
