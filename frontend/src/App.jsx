import { useState, useEffect, useRef } from "react";
import io from "socket.io-client";

const socket = io("https://expresit-production.up.railway.app", {
  transports: ["websocket"],
});

function App() {
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState("");
  const [preference, setPreference] = useState("");
  const [roomId, setRoomId] = useState(null);
  const [partner, setPartner] = useState(null);
  const [searching, setSearching] = useState(false);
  const [chatStartTime, setChatStartTime] = useState(null);
  const [timer, setTimer] = useState("00:00");
  const [onlineCount, setOnlineCount] = useState(0);
  const [message, setMessage] = useState("");
  const [chat, setChat] = useState([]);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    socket.on("onlineCount", (count) => {
      setOnlineCount(count);
    });

    socket.on("searching", () => setSearching(true));

    socket.on("matched", (data) => {
      setSearching(false);
      setRoomId(data.roomId);
      setPartner({ name: data.partnerName, age: data.partnerAge });
      setChatStartTime(data.chatStartTime);
    });

    socket.on("receiveMessage", (msg) => {
      setChat((prev) => [...prev, { text: msg, sender: "stranger" }]);
    });

    return () => {
      socket.off("onlineCount");
      socket.off("searching");
      socket.off("matched");
      socket.off("receiveMessage");
    };
  }, []);

  // 🔥 Timer logic
  useEffect(() => {
    if (!chatStartTime) return;

    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - chatStartTime) / 1000);
      const mins = String(Math.floor(seconds / 60)).padStart(2, "0");
      const secs = String(seconds % 60).padStart(2, "0");
      setTimer(`${mins}:${secs}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [chatStartTime]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  const startChat = () => {
    if (!name || !age || !gender || !preference) {
      alert("All fields are required!");
      return;
    }

    socket.emit("startChat", { name, age, gender, preference });
  };

  const sendMessage = () => {
    if (!message.trim()) return;

    socket.emit("sendMessage", { roomId, message });
    setChat((prev) => [...prev, { text: message, sender: "you" }]);
    setMessage("");
  };

  return (
    <div className="container">
      {!roomId ? (
        <div className="card">
          <h1>ExpresSit</h1>

          <input
            placeholder="Your Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            type="number"
            placeholder="Your Age"
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />

          <select onChange={(e) => setGender(e.target.value)}>
            <option value="">Your Gender</option>
            <option value="boy">Boy</option>
            <option value="girl">Girl</option>
          </select>

          <select onChange={(e) => setPreference(e.target.value)}>
            <option value="">Whom do you want to chat?</option>
            <option value="boy">Boy</option>
            <option value="girl">Girl</option>
            <option value="both">Both</option>
          </select>

          <button onClick={startChat}>Start Chat</button>

          {searching && <p>🔎 Searching for match...</p>}
        </div>
      ) : (
        <div className="chat-box">
          {/* Partner Info */}
          <div style={{ textAlign: "center", marginBottom: "10px" }}>
            <h2 style={{ margin: 0 }}>
              Chatting with {partner?.name} ({partner?.age})
            </h2>
            <div style={{ fontSize: "14px", color: "gray" }}>⏱ {timer}</div>
          </div>

          <div className="messages">
            {chat.map((msg, index) => (
              <div
                key={index}
                className={`msg ${msg.sender === "you" ? "you" : "stranger"}`}
              >
                {msg.text}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-row">
            <input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type message..."
            />
            <button onClick={sendMessage}>Send</button>
          </div>
        </div>
      )}

      {/* 🔥 Online Users Counter */}
      <div
        style={{
          position: "fixed",
          bottom: "15px",
          right: "15px",
          background: "#4e73df",
          color: "white",
          padding: "8px 12px",
          borderRadius: "8px",
          fontSize: "14px",
        }}
      >
        🟢 Online: {onlineCount}
      </div>
    </div>
  );
}

export default App;
