// Package ws is the Real-time layer (PRD §2.3): terminal streaming, live
// status, live events. One Hub, one room per assessment session — a
// candidate's own workspace and the admin's Global Session Monitor (PRD
// §1.11) can both subscribe to the same session's room and see the same
// events as they happen, instead of the admin side polling for a reload.
package ws

import (
	"log/slog"
	"net/http"
	"slices"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = (pongWait * 9) / 10
	sendBuffer = 64
)

// Hub fans messages out to every client subscribed to a room (a session id).
// Safe for concurrent use — every method takes the lock it needs and holds
// it only long enough to touch the room map, never while doing network I/O.
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]map[*client]struct{}

	upgrader websocket.Upgrader
}

// NewHub builds a Hub whose upgrade handshake only accepts the given
// origins — the same allowlist the HTTP CORS middleware uses
// (internal/httpapi), since a WebSocket handshake's Origin header isn't
// covered by ordinary CORS preflight and has to be checked here instead.
func NewHub(allowedOrigins []string) *Hub {
	origins := slices.Clone(allowedOrigins)
	return &Hub{
		rooms: make(map[string]map[*client]struct{}),
		upgrader: websocket.Upgrader{
			ReadBufferSize:  4096,
			WriteBufferSize: 4096,
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				return origin == "" || slices.Contains(origins, origin)
			},
		},
	}
}

type client struct {
	hub  *Hub
	room string
	conn *websocket.Conn
	send chan []byte
}

// Join upgrades an HTTP request to a WebSocket connection and adds it to a
// session's room. It returns once the connection closes (read pump exits),
// so callers should call it directly from the HTTP handler goroutine, not
// spawn it in a new one.
func (h *Hub) Join(w http.ResponseWriter, r *http.Request, room string) error {
	conn, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return err
	}

	c := &client{hub: h, room: room, conn: conn, send: make(chan []byte, sendBuffer)}
	h.add(c)
	defer h.remove(c)

	go c.writePump()
	c.readPump() // blocks until the connection closes
	return nil
}

func (h *Hub) add(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.rooms[c.room] == nil {
		h.rooms[c.room] = make(map[*client]struct{})
	}
	h.rooms[c.room][c] = struct{}{}
}

func (h *Hub) remove(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if room, ok := h.rooms[c.room]; ok {
		delete(room, c)
		if len(room) == 0 {
			delete(h.rooms, c.room)
		}
	}
	close(c.send)
}

// Broadcast sends message to every client currently subscribed to room.
// A client whose send buffer is already full is dropped rather than let a
// slow reader stall the room for everyone else.
func (h *Hub) Broadcast(room string, message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[room] {
		select {
		case c.send <- message:
		default:
			slog.Warn("ws: dropping message to slow client", "room", room)
		}
	}
}

func (c *client) readPump() {
	defer c.conn.Close()
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		// This service's clients are event/terminal *subscribers* today —
		// inbound frames are read only to drive the pong/timeout loop and
		// detect a closed connection, not acted on. A candidate-driven
		// terminal (sending keystrokes upstream) is future scope once the
		// sandbox side (internal/sandbox) actually backs it.
		if _, _, err := c.conn.ReadMessage(); err != nil {
			return
		}
	}
}

func (c *client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()
	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
