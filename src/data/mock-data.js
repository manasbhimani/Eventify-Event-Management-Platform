/**
 * src/data/mock-data.js
 *
 * Eventify — Seed data for the in-memory development store.
 *
 * This file defines the INITIAL state of events, categories, and bookings.
 * It is imported once by store.js, which creates working copies so that
 * the seed arrays themselves are never mutated during a server session.
 *
 * When the server restarts, the store is re-initialised from these seeds,
 * effectively resetting all changes made through the API.
 */

"use strict";

const seedEvents = [
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

const seedCategories = [
    { id: 1, name: "Technology" },
    { id: 2, name: "Music" },
    { id: 3, name: "Workshop" },
    { id: 4, name: "Business" },
    { id: 5, name: "Sports" },
    { id: 6, name: "Conference" }
];

const seedBookings = [
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

module.exports = { seedEvents, seedCategories, seedBookings };
