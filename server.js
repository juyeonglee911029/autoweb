const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
var admin = require("firebase-admin");

// Firebase Admin Initialization
try {
  var serviceAccount = require("./serviceAccountKey.json");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://pupu-tetris-default-rtdb.firebaseio.com"
  });
  console.log("Firebase Admin initialized successfully.");
} catch (error) {
  console.warn("Firebase Admin could not be initialized. Please ensure serviceAccountKey.json is present.");
}

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files
app.use(express.static(__dirname));

// Route for the main game
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Socket.io logic
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // Assign a random guest name
  const guestName = `User${Math.floor(Math.random() * 1000)}`;
  socket.emit('init', { name: guestName });

  // Chat
  socket.on('chatMessage', (msg) => {
    io.emit('chatMessage', msg);
  });

  // Multiplayer Attack (Send garbage lines)
  socket.on('attack', (lines) => {
    // Broadcast to everyone else (in a real match logic, this would be targeted)
    socket.broadcast.emit('garbage', lines);
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
