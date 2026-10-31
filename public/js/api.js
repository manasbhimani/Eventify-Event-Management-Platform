/**
 * public/js/api.js
 *
 * Eventify — Frontend API Client Helper
 *
 * A lightweight, vanilla JavaScript helper for making fetch requests to the
 * same-origin /api endpoints. Handles credentials, CSRF headers, HTTP errors,
 * network failures, and JSON parsing consistently without external dependencies.
 */

(function () {
    "use strict";

    const BASE_URL = "/api";

    /**
     * Read the CSRF token from the non-HttpOnly cookie set by the server.
     * @returns {string|null}
     */
    function getCsrfToken() {
        if (typeof document === "undefined") return null;
        const match = document.cookie.match(/(?:^|;\s*)eventify_csrf=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : null;
    }

    /**
     * Perform an HTTP request to the Eventify backend API.
     * @param {string} endpoint - API path (e.g. "/events" or "events")
     * @param {RequestInit} [options] - Fetch options
     * @returns {Promise<any>} Parsed response data
     */
    async function request(endpoint, options = {}) {
        const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
        const url = `${BASE_URL}${cleanEndpoint}`;

        const method = (options.method || "GET").toUpperCase();
        const headers = {
            Accept: "application/json",
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        };

        // Attach CSRF token on state-changing requests if present
        if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
            let csrfToken = getCsrfToken();
            if (!csrfToken) {
                try {
                    const csrfRes = await fetch(`${BASE_URL}/auth/csrf`, {
                        credentials: "same-origin",
                        headers: { Accept: "application/json" }
                    });
                    const csrfData = await csrfRes.json();
                    if (csrfData && csrfData.csrfToken) {
                        csrfToken = csrfData.csrfToken;
                    }
                } catch (_) {
                    // Ignore, will be caught by request error handling
                }
            }
            if (csrfToken && !headers["X-CSRF-Token"]) {
                headers["X-CSRF-Token"] = csrfToken;
            }
        }

        let response;
        try {
            response = await fetch(url, {
                credentials: "same-origin",
                headers,
                ...options
            });
        } catch (networkError) {
            const err = new Error("Network error: Unable to connect to the server. Please check your connection.");
            err.isNetworkError = true;
            throw err;
        }

        let data = null;
        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("application/json")) {
            try {
                data = await response.json();
            } catch (jsonErr) {
                const err = new Error("Invalid response format: Expected JSON from server.");
                err.status = response.status;
                throw err;
            }
        } else {
            const text = await response.text();
            if (!response.ok) {
                const err = new Error(text || `Request failed with HTTP status ${response.status}`);
                err.status = response.status;
                throw err;
            }
            data = text;
        }

        if (!response.ok) {
            const message = (data && data.message)
                ? data.message
                : `Request failed with status ${response.status} (${response.statusText})`;
            const err = new Error(message);
            err.status = response.status;
            err.data = data;
            throw err;
        }

        return data;
    }

    /**
     * Eventify API methods
     */
    const api = {
        // --- AUTHENTICATION & IDENTITY ---

        /**
         * Log in with email and password.
         * @param {string} email
         * @param {string} password
         * @returns {Promise<{success: boolean, message: string, user: Object, csrfToken: string}>}
         */
        login(email, password) {
            return request("/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password })
            });
        },

        /**
         * Register a new ATTENDEE account.
         * @param {string} name
         * @param {string} email
         * @param {string} password
         * @returns {Promise<{success: boolean, message: string, user: Object, csrfToken: string}>}
         */
        register(name, email, password) {
            return request("/auth/register", {
                method: "POST",
                body: JSON.stringify({ name, email, password })
            });
        },

        /**
         * Log out current session and invalidate cookies.
         * @returns {Promise<{success: boolean, message: string}>}
         */
        logout() {
            return request("/auth/logout", {
                method: "POST"
            });
        },

        /**
         * Get the currently authenticated user's details.
         * @returns {Promise<{success: boolean, user: Object, csrfToken: string}>}
         */
        getMe() {
            return request("/auth/me");
        },

        /**
         * Retrieve active CSRF token.
         * @returns {string|null}
         */
        getCsrfToken,

        // --- EVENTS ---

        /**
         * Fetch all events, optionally filtered by category and/or search query.
         * @param {Object} [params]
         * @param {string} [params.category]
         * @param {string} [params.search]
         * @returns {Promise<{success: boolean, count: number, data: Array}>}
         */
        getEvents(params = {}) {
            const query = new URLSearchParams();
            if (params.category && params.category !== "All") {
                query.set("category", params.category);
            }
            if (params.search && params.search.trim()) {
                query.set("search", params.search.trim());
            }
            if (params.status) {
                query.set("status", params.status);
            }
            const qs = query.toString();
            return request(`/events${qs ? "?" + qs : ""}`);
        },

        /**
         * Fetch a single event by numeric ID.
         * @param {number|string} id
         * @returns {Promise<{success: boolean, data: Object}>}
         */
        getEventById(id) {
            return request(`/events/${encodeURIComponent(id)}`);
        },

        /**
         * Create a new event (ORGANIZER or ADMIN).
         * @param {Object} eventData
         * @returns {Promise<{success: boolean, message: string, data: Object}>}
         */
        createEvent(eventData) {
            return request("/events", {
                method: "POST",
                body: JSON.stringify(eventData)
            });
        },

        /**
         * Update an existing event (ORGANIZER or ADMIN).
         * @param {number|string} id
         * @param {Object} eventData
         * @returns {Promise<{success: boolean, message: string, data: Object}>}
         */
        updateEvent(id, eventData) {
            return request(`/events/${encodeURIComponent(id)}`, {
                method: "PUT",
                body: JSON.stringify(eventData)
            });
        },

        /**
         * Cancel an event, notify attendees, and record simulated refunds (ORGANIZER or ADMIN).
         * @param {number|string} id
         * @param {Object} [options] - { reason }
         * @returns {Promise<{success: boolean, message: string, data: Object}>}
         */
        cancelEvent(id, options = {}) {
            return request(`/events/${encodeURIComponent(id)}/cancel`, {
                method: "POST",
                body: JSON.stringify(options)
            });
        },

        // --- CATEGORIES ---

        /**
         * Fetch all categories.
         * @returns {Promise<{success: boolean, data: Array<{id: number, name: string}>}>}
         */
        getCategories() {
            return request("/categories");
        },

        // --- BOOKINGS ---

        /**
         * Fetch bookings (caller's own bookings; ADMIN sees all).
         * @returns {Promise<{success: boolean, count: number, data: Array}>}
         */
        getBookings() {
            return request("/bookings");
        },

        /**
         * Create a new ticket booking for an event.
         * @param {number|string} eventId
         * @param {number} quantity
         * @returns {Promise<{success: boolean, message: string, data: Object}>}
         */
        createBooking(eventId, quantity) {
            return request("/bookings", {
                method: "POST",
                body: JSON.stringify({ eventId: Number(eventId), quantity: Number(quantity) })
            });
        },

        /**
         * Cancel an existing booking by reference ID.
         * @param {string} bookingId
         * @returns {Promise<{success: boolean, message: string, data: Object}>}
         */
        cancelBooking(bookingId) {
            return request(`/bookings/${encodeURIComponent(bookingId)}/cancel`, {
                method: "POST"
            });
        },

        // --- NOTIFICATIONS ---

        /**
         * Fetch notifications for current user.
         * @param {Object} [params] - { status }
         * @returns {Promise<{success: boolean, count: number, data: Array}>}
         */
        getNotifications(params = {}) {
            const query = new URLSearchParams();
            if (params.status) {
                query.set("status", params.status);
            }
            const qs = query.toString();
            return request(`/notifications${qs ? "?" + qs : ""}`);
        },

        /**
         * Dismiss a notification by ID.
         * @param {number|string} id
         * @returns {Promise<{success: boolean, message: string, data: Object}>}
         */
        dismissNotification(id) {
            return request(`/notifications/${encodeURIComponent(id)}/dismiss`, {
                method: "POST"
            });
        },

        // --- ADMIN ---

        /**
         * Fetch platform statistics (ADMIN only).
         * @returns {Promise<{success: boolean, stats: Object}>}
         */
        getAdminStats() {
            return request("/admin/stats");
        },

        request
    };

    window.api = api;
})();
