# Eventify - Event Management & Ticket Booking Platform

A full-stack event management and ticket booking web application built with HTML5, CSS3, Vanilla JavaScript, Node.js (Express), and Oracle Database.

## How to Run the Project

1. **Install Dependencies** (already installed, or run if on a fresh machine):
   ```bash
   npm install
   ```

2. **Start the Server**:
   ```bash
   npm start
   ```
   *(Or for auto-reload during development: `npm run dev`)*

3. **Open in Browser**:
   Visit [http://localhost:3000](http://localhost:3000)

## Available Pages
- **Home / Discover**: [http://localhost:3000](http://localhost:3000)
- **Event Details**: [http://localhost:3000/event.html?id=1](http://localhost:3000/event.html?id=1)
- **Login**: [http://localhost:3000/login.html](http://localhost:3000/login.html)
- **Register**: [http://localhost:3000/register.html](http://localhost:3000/register.html)
- **Attendee Bookings**: [http://localhost:3000/bookings.html](http://localhost:3000/bookings.html)
- **Organizer Dashboard**: [http://localhost:3000/organizer.html](http://localhost:3000/organizer.html)
- **Admin Dashboard**: [http://localhost:3000/admin.html](http://localhost:3000/admin.html)

## Backend API Endpoints
- `GET /api/health` — Server and database health check
- `GET /api/events` — Browse events with category and search filter
- `GET /api/events/:id` — View specific event
- `POST /api/events` — Create new event
- `GET /api/categories` — Browse event categories
- `POST /api/auth/register` — Register a new account
- `POST /api/auth/login` — Sign in
- `GET /api/bookings` — Booking records
- `POST /api/bookings` — Create a new ticket booking
- `POST /api/bookings/:id/cancel` — Cancel a booking