import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './roomManager.js';
import { PlayerManager } from './playerManager.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

app.use(cors());

// Serve static files from root directory (index.html, game.js, ui-system.js, style.css)
// This serves files from the project root
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

app.use(express.static(rootDir));

// Also serve client and shared directories explicitly
app.use('/client', express.static(path.join(rootDir, 'client')));
app.use('/shared', express.static(path.join(rootDir, 'shared')));

const roomManager = new RoomManager();
const playerManager = new PlayerManager(io, roomManager);

// Socket.io connection handling
io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
        playerManager.handleDisconnect(socket);
    });

    // Forward all messages to player manager
    socket.onAny((eventName, data) => {
        playerManager.handleMessage(socket, eventName, data);
    });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Farmers Fray server running on port ${PORT}`);
    console.log(`Open http://localhost:${PORT} in your browser`);
    console.log(`\nIMPORTANT: Access the game through http://localhost:${PORT}`);
    console.log(`Don't use VS Code Live Server or file:// protocol - use the Express server!`);
});

