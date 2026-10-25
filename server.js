/**
 * Eventify - Backend Server
 * Express.js server providing REST API and serving frontend static files
 */

const express = require("express");
const path = require("path");
const cors = require("cors");
require("dotenv").config();

const { initDB, closeDB, getIsConnected } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve frontend static files
app.use(express.static(path.join(__dirname, "public")));

// --- IN-MEMORY INITIAL DATA (For testing when Oracle DB is offline) ---
const mockEvents = [
    {
        id: 1,
        title: "Future of Technology Summit",
        category: "Technology",
        date: "2027-01-15",
        city: "Surat",
        venue: "Innovation Hall",
        price: 199,
        capacity: 100,
        description: "Explore emerging technologies, meet fellow technology enthusiasts, and discover new ideas.",
        image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80",
        status: "PUBLISHED"
    },
    {
        id: 2,
        title: "Live Music Night",
        category: "Music",
        date: "2027-01-22",
        city: "Ahmedabad",
        venue: "City Auditorium",
        price: 499,
        capacity: 200,
        description: "Enjoy an evening of live performances, music, and community.",
        image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=800&q=80",
        status: "PUBLISHED"
    },
    {
        id: 3,
        title: "Creative Design Workshop",
        category: "Workshop",
        date: "2027-02-05",
        city: "Surat",
        venue: "Creative Studio",
        price: 299,
        capacity: 50,
        description: "Learn creative problem-solving and explore design fundamentals.",
        image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
        status: "PUBLISHED"
    },
    {
        id: 4,
        title: "Startup Networking Meetup",
        category: "Business",
        date: "2027-02-12",
        city: "Vadodara",
        venue: "Business Hub",
        price: 0,
        capacity: 80,
        description: "Connect with students, entrepreneurs, and professionals.",
        image: "https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&fit=crop&w=800&q=80",
        status: "PUBLISHED"
    },
    {
        id: 5,
        title: "Community Sports Day",
        category: "Sports",
        date: "2027-02-20",
        city: "Surat",
        venue: "Sports Complex",
        price: 149,
        capacity: 100,
        description: "Friendly competition, teamwork, and activities for sports enthusiasts.",
        image: "https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=800&q=80",
        status: "PUBLISHED"
    },
    {
        id: 6,
        title: "Web Development Bootcamp",
        category: "Technology",
        date: "2027-03-06",
        city: "Ahmedabad",
        venue: "Learning Centre",
        price: 399,
        capacity: 60,
        description: "Explore the fundamentals of modern web development.",
        image: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80",
        status: "PUBLISHED"
    }
];

const mockCategories = [
    { id: 1, name: "Technology" },
    { id: 2, name: "Music" },
    { id: 3, name: "Workshop" },
    { id: 4, name: "Business" },
    { id: 5, name: "Sports" },
    { id: 6, name: "Conference" }
];

const mockBookings = [
    {
        id: "EVT-1001",
        eventId: 1,
        title: "Future of Technology Summit",
        date: "2027-01-15T10:00:00",
        venue: "Innovation Hall, Surat",
        quantity: 2,
        amount: 398,
        status: "CONFIRMED",
        icon: "💻"
    },
    {
        id: "EVT-1002",
        eventId: 3,
        title: "Creative Design Workshop",
        date: "2027-02-10T11:00:00",
        venue: "Creative Studio, Ahmedabad",
        quantity: 1,
        amount: 299,
        status: "CONFIRMED",
        icon: "🎨"
    }
];

// --- API ROUTES ---

// 1. Health check
app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        app: "Eventify Event Management Platform",
        database: getIsConnected() ? "CONNECTED (Oracle DB)" : "DISCONNECTED / STANDALONE",
        timestamp: new Date().toISOString()
    });
});

// 2. Categories
app.get("/api/categories", (req, res) => {
    res.json({
        success: true,
        data: mockCategories
    });
});

// 3. Events
app.get("/api/events", (req, res) => {
    const { category, search } = req.query;
    let results = [...mockEvents];

    if (category && category !== "All") {
        results = results.filter(e => e.category.toLowerCase() === category.toLowerCase());
    }

    if (search) {
        const query = search.toLowerCase();
        results = results.filter(e =>
            e.title.toLowerCase().includes(query) ||
            e.category.toLowerCase().includes(query) ||
            e.city.toLowerCase().includes(query) ||
            e.venue.toLowerCase().includes(query)
        );
    }

    res.json({
        success: true,
        count: results.length,
        data: results
    });
});

app.get("/api/events/:id", (req, res) => {
    const eventId = parseInt(req.params.id, 10);
    const event = mockEvents.find(e => e.id === eventId);

    if (!event) {
        return res.status(404).json({
            success: false,
            message: `Event with ID ${req.params.id} not found.`
        });
    }

    res.json({
        success: true,
        data: event
    });
});

app.post("/api/events", (req, res) => {
    const { title, category, date, city, venue, price, capacity, description } = req.body;

    if (!title || !category || !date) {
        return res.status(400).json({
            success: false,
            message: "Title, category, and date are required fields."
        });
    }

    const newEvent = {
        id: mockEvents.length + 100,
        title,
        category,
        date,
        city: city || "Surat",
        venue: venue || "Main Auditorium",
        price: Number(price) || 0,
        capacity: Number(capacity) || 100,
        description: description || "",
        image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=800&q=80",
        status: "PUBLISHED"
    };

    mockEvents.push(newEvent);

    res.status(201).json({
        success: true,
        message: "Event created successfully.",
        data: newEvent
    });
});

// 4. Authentication (Basic endpoints)
app.post("/api/auth/register", (req, res) => {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({
            success: false,
            message: "Name, email, and password are required."
        });
    }

    res.status(201).json({
        success: true,
        message: "User registered successfully.",
        data: {
            id: 101,
            name,
            email,
            role: role || "ATTENDEE"
        }
    });
});

app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            success: false,
            message: "Email and password are required."
        });
    }

    res.json({
        success: true,
        message: "Login successful.",
        token: "demo-session-token",
        user: {
            id: 1,
            name: "Demo User",
            email: email,
            role: email.includes("admin") ? "ADMIN" : email.includes("org") ? "ORGANIZER" : "ATTENDEE"
        }
    });
});

app.get("/api/auth/me", (req, res) => {
    res.json({
        success: true,
        user: {
            id: 1,
            name: "Demo User",
            email: "user@eventify.local",
            role: "ATTENDEE"
        }
    });
});

// 5. Bookings
app.get("/api/bookings", (req, res) => {
    res.json({
        success: true,
        count: mockBookings.length,
        data: mockBookings
    });
});

app.post("/api/bookings", (req, res) => {
    const { eventId, quantity } = req.body;
    const event = mockEvents.find(e => e.id === Number(eventId));

    if (!event) {
        return res.status(404).json({
            success: false,
            message: "Event not found."
        });
    }

    const qty = Number(quantity) || 1;
    const newBooking = {
        id: `EVT-${Math.floor(1000 + Math.random() * 9000)}`,
        eventId: event.id,
        title: event.title,
        date: event.date + "T10:00:00",
        venue: `${event.venue}, ${event.city}`,
        quantity: qty,
        amount: event.price * qty,
        status: "CONFIRMED",
        icon: "🎟️"
    };

    mockBookings.push(newBooking);

    res.status(201).json({
        success: true,
        message: "Booking confirmed successfully.",
        data: newBooking
    });
});

app.post("/api/bookings/:id/cancel", (req, res) => {
    const booking = mockBookings.find(b => b.id === req.params.id);
    if (!booking) {
        return res.status(404).json({
            success: false,
            message: "Booking not found."
        });
    }

    booking.status = "CANCELLED";
    res.json({
        success: true,
        message: `Booking ${req.params.id} cancelled successfully.`,
        data: booking
    });
});

// 6. Admin stats placeholder
app.get("/api/admin/stats", (req, res) => {
    res.json({
        success: true,
        stats: {
            totalUsers: 4,
            totalEvents: mockEvents.length,
            totalBookings: mockBookings.length,
            revenue: mockBookings.reduce((sum, b) => sum + (b.status !== "CANCELLED" ? b.amount : 0), 0)
        }
    });
});

// Handle unknown API routes
app.all("/api/*", (req, res) => {
    res.status(404).json({
        success: false,
        message: `API endpoint '${req.originalUrl}' not found.`
    });
});

// Catch-all route to serve index.html for client-side navigation
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Start server and initialize DB connection
async function startServer() {
    await initDB();

    const server = app.listen(PORT, () => {
        console.log("==================================================");
        console.log(`  Eventify Server is running on http://localhost:${PORT}`);
        console.log(`  Open your browser and visit: http://localhost:${PORT}`);
        console.log("==================================================");
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
        console.log("\nShutting down server gracefully...");
        server.close(async () => {
            await closeDB();
            process.exit(0);
        });
    });

    process.on("SIGTERM", async () => {
        console.log("\nShutting down server gracefully...");
        server.close(async () => {
            await closeDB();
            process.exit(0);
        });
    });
}

startServer();
